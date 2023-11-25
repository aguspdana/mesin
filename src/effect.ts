import { MANAGER } from "./manager";
import type { Dependency } from "./types";

export function effect(cb: () => void) {
	let dependencies: Dependency[] = [];
	let clock = -1;

	function add_dependency(dependency: Dependency) {
		dependencies.push(dependency);
	}

	function update() {
		if (clock === MANAGER.clock) {
			return;
		}
		clock = MANAGER.clock;
		dependencies.forEach(({ unsubscribe }) => unsubscribe());
		dependencies = [];
		const value = MANAGER.compute(
			undefined,
			cb,
			{ add_dependency, notify: update },
		);
		return value;
	}

	function dispose() {
		dependencies.forEach((d) => d.unsubscribe());
	}

	update();

	return dispose;
}