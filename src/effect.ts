import { MANAGER } from "./manager";
import type { Dependency } from "./types";

export function effect(cb: () => void) {
	let dependencies: Dependency[] = [];
	let clock = -1;

	function add_dependency(dependency: Dependency) {
		dependencies.push(dependency);
	}

	function run() {
		if (clock === MANAGER.clock) {
			return;
		}
		clock = MANAGER.clock;
		const prev_dependencies = dependencies;
		dependencies = [];
		const value = MANAGER.compute(
			undefined,
			cb,
			{ add_dependency, notify: run },
		);
		prev_dependencies.forEach(({ unsubscribe }) => unsubscribe());
		return value;
	}

	function dispose() {
		dependencies.forEach((d) => d.unsubscribe());
	}

	run();

	return dispose;
}