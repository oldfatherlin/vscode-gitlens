'use strict';
import { QuickInputButton, Uri } from 'vscode';
import { Container } from '../../container';
import { Repository } from '../../git/gitService';
import { QuickCommandBase, QuickPickStep, StepAsyncGenerator, StepSelection, StepState } from '../quickCommand';
import { FlagsQuickPickItem, RepositoryQuickPickItem } from '../../quickpicks';
import { Dates, Strings } from '../../system';
import { GlyphChars } from '../../constants';
import { Logger } from '../../logger';

type Flags = '--rebase';

interface State {
	repos: Repository[];
	flags: Flags[];
}

export interface PullGitCommandArgs {
	readonly command: 'pull';
	state?: Partial<State>;

	confirm?: boolean;
}

export class PullGitCommand extends QuickCommandBase<State> {
	private readonly Buttons = class {
		static readonly Fetch: QuickInputButton = {
			iconPath: {
				dark: Uri.file(Container.context.asAbsolutePath('images/dark/icon-sync.svg')),
				light: Uri.file(Container.context.asAbsolutePath('images/light/icon-sync.svg'))
			},
			tooltip: 'Fetch'
		};
	};

	constructor(args?: PullGitCommandArgs) {
		super('pull', 'pull', 'Pull', {
			description: 'fetches and integrates changes from a remote into the current branch'
		});

		if (args == null || args.state === undefined) return;

		let counter = 0;
		if (args.state.repos !== undefined && args.state.repos.length !== 0) {
			counter++;
		}

		this._initialState = {
			counter: counter,
			confirm: args.confirm,
			...args.state
		};
	}

	execute(state: State) {
		return Container.git.pullAll(state.repos, { rebase: state.flags.includes('--rebase') });
	}

	protected async *steps(): StepAsyncGenerator {
		const state: StepState<State> = this._initialState === undefined ? { counter: 0 } : this._initialState;
		let repos;

		if (state.flags == null) {
			state.flags = [];
		}

		while (true) {
			try {
				if (repos === undefined) {
					repos = [...(await Container.git.getOrderedRepositories())];
				}

				if (state.repos === undefined || state.counter < 1) {
					if (repos.length === 1) {
						state.counter++;
						state.repos = [repos[0]];
					} else {
						let actives: Repository[];
						if (state.repos) {
							actives = state.repos;
						} else {
							const active = await Container.git.getActiveRepository();
							actives = active ? [active] : [];
						}

						const step = this.createPickStep<RepositoryQuickPickItem>({
							multiselect: true,
							title: this.title,
							placeholder: 'Choose repositories',
							items: await Promise.all(
								repos.map(repo =>
									RepositoryQuickPickItem.create(repo, actives.some(r => r.id === repo.id), {
										branch: true,
										fetched: true,
										status: true
									})
								)
							)
						});
						const selection: StepSelection<typeof step> = yield step;

						if (!this.canPickStepMoveNext(step, state, selection)) {
							break;
						}

						state.repos = selection.map(i => i.item);
					}
				}

				if (this.confirm(state.confirm)) {
					let step: QuickPickStep<FlagsQuickPickItem<Flags>>;
					if (state.repos.length > 1) {
						step = this.createConfirmStep(
							`Confirm ${this.title}${Strings.pad(GlyphChars.Dot, 2, 2)}${
								state.repos.length
							} repositories`,
							[
								FlagsQuickPickItem.create<Flags>(state.flags, [], {
									label: this.title,
									description: '',
									detail: `Will pull ${state.repos.length} repositories`
								}),
								FlagsQuickPickItem.create<Flags>(state.flags, ['--rebase'], {
									label: `${this.title} with Rebase`,
									description: '--rebase',
									detail: `Will pull with rebase ${state.repos.length} repositories`
								})
							]
						);
					} else {
						step = await this.getSingleRepoConfirmStep(state);
					}

					const selection: StepSelection<typeof step> = yield step;

					if (!this.canPickStepMoveNext(step, state, selection)) {
						if (repos.length === 1) {
							break;
						}

						continue;
					}

					state.flags = selection[0].item;
				}

				this.execute(state as State);
				break;
			} catch (ex) {
				Logger.error(ex, this.title);

				throw ex;
			}
		}

		return undefined;
	}

	private async getSingleRepoConfirmStep(state: StepState<State>) {
		const repo = state.repos![0];
		const [status, lastFetched] = await Promise.all([repo.getStatus(), repo.getLastFetched()]);

		const title = `Confirm ${this.title}${Strings.pad(GlyphChars.Dot, 2, 2)}${repo.formattedName}`;

		let detail = repo.formattedName;
		let fetchedOn = '';
		if (lastFetched !== 0 && status !== undefined) {
			detail = Strings.pluralize('commit', status.state.behind);

			fetchedOn = `${Strings.pad(GlyphChars.Dot, 2, 2)}Last fetched ${Dates.getFormatter(
				new Date(lastFetched)
			).fromNow()}`;
		}

		const step = this.createConfirmStep<FlagsQuickPickItem<Flags>>(
			`${title}${fetchedOn}`,
			[
				FlagsQuickPickItem.create<Flags>(state.flags!, [], {
					label: this.title,
					description: '',
					detail: `Will pull ${detail}`
				}),
				FlagsQuickPickItem.create<Flags>(state.flags!, ['--rebase'], {
					label: `${this.title} with Rebase`,
					description: '--rebase',
					detail: `Will pull ${detail} with rebase`
				})
			],
			undefined,
			{
				additionalButtons: [this.Buttons.Fetch],
				onDidClickButton: async (quickpick, button) => {
					if (button !== this.Buttons.Fetch) return;
					quickpick.title = `${title}${Strings.pad(GlyphChars.Dot, 2, 2)}Fetching${GlyphChars.Ellipsis}`;
					quickpick.busy = true;
					quickpick.enabled = false;
					try {
						await repo.fetch({ progress: true });
						const step = await this.getSingleRepoConfirmStep(state);
						quickpick.title = step.title;
						quickpick.items = step.items as FlagsQuickPickItem<Flags>[];
					} finally {
						quickpick.busy = false;
						quickpick.enabled = true;
					}
				}
			}
		);

		return step;
	}
}
