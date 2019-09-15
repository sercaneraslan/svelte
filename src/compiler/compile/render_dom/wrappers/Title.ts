import { b, x } from 'code-red';
import Wrapper from './shared/Wrapper';
import Renderer from '../Renderer';
import Block from '../Block';
import Title from '../../nodes/Title';
import { stringify } from '../../utils/stringify';
import add_to_set from '../../utils/add_to_set';
import Text from '../../nodes/Text';
import { Identifier } from 'estree';
import { changed } from './shared/changed';

export default class TitleWrapper extends Wrapper {
	node: Title;

	constructor(
		renderer: Renderer,
		block: Block,
		parent: Wrapper,
		node: Title,
		_strip_whitespace: boolean,
		_next_sibling: Wrapper
	) {
		super(renderer, block, parent, node);
	}

	render(block: Block, _parent_node: Identifier, _parent_nodes: Identifier) {
		const is_dynamic = !!this.node.children.find(node => node.type !== 'Text');

		if (is_dynamic) {
			let value;

			const all_dependencies: Set<string> = new Set();

			// TODO some of this code is repeated in Tag.ts — would be good to
			// DRY it out if that's possible without introducing crazy indirection
			if (this.node.children.length === 1) {
				// single {tag} — may be a non-string
				// @ts-ignore todo: check this
				const { expression } = this.node.children[0];
				value = expression.manipulate(block);
				add_to_set(all_dependencies, expression.dependencies);
			} else {
				// '{foo} {bar}' — treat as string concatenation
				value =
					(this.node.children[0].type === 'Text' ? '' : `"" + `) +
					this.node.children
						.map((chunk) => {
							if (chunk.type === 'Text') {
								return stringify(chunk.data);
							} else {
								// @ts-ignore todo: check this
								const snippet = chunk.expression.manipulate(block);
								// @ts-ignore todo: check this
								chunk.expression.dependencies.forEach(d => {
									all_dependencies.add(d);
								});

								// @ts-ignore todo: check this
								return chunk.expression.get_precedence() <= 13 ? `(${snippet})` : snippet;
							}
						})
						.join(' + ');
			}

			const last = this.node.should_cache && block.get_unique_name(
				`title_value`
			);

			if (this.node.should_cache) block.add_variable(last);

			const init = this.node.should_cache ? `${last} = ${value}` : value;

			block.chunks.init.push(
				b`@_document.title = ${init};`
			);

			const updater = b`@_document.title = ${this.node.should_cache ? last : value};`;

			if (all_dependencies.size) {
				const dependencies = Array.from(all_dependencies);

				let condition = changed(dependencies);

				if (block.has_outros) {
					condition = x`!#current || ${condition}`;
				}

				if (this.node.should_cache) {
					condition = x`${condition} && (${last} !== (${last} = ${value}))`;
				}

				block.chunks.update.push(b`
					if (${condition}) {
						${updater}
					}`);
			}
		} else {
			const value = this.node.children.length > 0
				? stringify((this.node.children[0] as Text).data)
				: '""';

			block.chunks.hydrate.push(b`@_document.title = ${value};`);
		}
	}
}
