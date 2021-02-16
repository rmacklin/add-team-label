import * as core from '@actions/core';
import * as github from '@actions/github';

async function run(): Promise<void> {
  try {
    const token = core.getInput('repo_token', { required: true });

    const prNumber = getPrNumber();
    if (!prNumber) {
      throw new Error('Could not get pull request number from context');
    }

    const client = new github.GitHub(token);
    const labels = [];

    if (prNumber % 2 === 0) {
      labels.push('even');
    } else {
      labels.push('odd');
    }

    core.debug(`labels to add: ${JSON.stringify(labels)}`);

    if (labels.length > 0) {
      await addLabels(client, prNumber, labels);
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

function getPrNumber(): number | undefined {
  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest) {
    return undefined;
  }

  return pullRequest.number;
}

async function addLabels(
  client: github.GitHub,
  prNumber: number,
  labels: string[]
): Promise<void> {
  await client.issues.addLabels({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: prNumber,
    labels
  });
}

run();
