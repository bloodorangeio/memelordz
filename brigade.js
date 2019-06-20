const { events, Job } = require('brigadier');

//
// Required project secrets:
// - imageRegistryURL
// - imageRegistryUsername
// - imageRegistryPassword
// - helmDeployServiceAccount
// - githubBotAccessToken
//

// Custom values for this project
const projectRootDomain      = 'memelordz.net';
const projectGithubOwner     = 'bloodorangeio';
const projectGithubRepo      = 'memelordz';
const projectImageRepo       = 'bloodorangeio/memelordz';
const projectHelmReleaseBase = 'memelordz';
const dockerfileRelativeDir  = 'app/';
const helmChartRelativeDir   = 'deploy/memelordz/';
const helmDeployNamespace    = 'default';
const dindBaseImage          = 'docker:stable-dind';
const helmBaseImage          = 'lachlanevenson/k8s-helm:v2.14.1';
const githubCommentBaseImage = 'cloudposse/github-commenter:0.5.0'

// Build and push container image
function buildPushImage(project, imageRepo, imageTag) {
  let url = project.secrets['imageRegistryURL'];
  let username = project.secrets['imageRegistryUsername'];
  let password = project.secrets['imageRegistryPassword'];

  let job = new Job('build-push', dindBaseImage);
  job.privileged = true;
  job.tasks = [
    'dockerd-entrypoint.sh &',
    'sleep 5',
    `cd /src/${dockerfileRelativeDir}`,
    `docker login ${url} -u ${username} -p '${password}'`,
    `docker build -t ${url}/${imageRepo}:${imageTag} .`,
    `docker push ${url}/${imageRepo}:${imageTag}`,
    `docker logout ${url}`
  ];

  return job;
}

// Deploy Helm chart
function deployHelm(project, namespace, release, gitCommit, gitBranch, imageTag, ingressHost) {
  let serviceAccount = project.secrets['helmDeployServiceAccount'];

  let job = new Job('deploy', helmBaseImage);
  job.serviceAccount = serviceAccount;

  job.tasks = [
    `cd /src/${helmChartRelativeDir}`,
    `helm upgrade --namespace ${namespace} --install ${release} . `+
      `--set git.commit=${gitCommit} ` +
      `--set git.branch=${gitBranch} ` +
      `--set image.tag=${imageTag} `+
      `--set ingress.host=${ingressHost} `
  ];

  return job;
}

// Undeploy Helm release
function undeployHelm(project, release) {
  let serviceAccount = project.secrets['helmDeployServiceAccount'];

  let job = new Job('undeploy', helmBaseImage);
  job.serviceAccount = serviceAccount;
  job.tasks = [`helm delete --purge ${release}`];

  return job;
}

// Write comment on GitHub PR
function commentOnGithubPR(project, owner, repo, number, comment) {
  let accessToken = project.secrets['githubBotAccessToken'];

  let job = new Job('github-comment', githubCommentBaseImage);
  job.tasks = [
    `export GITHUB_TOKEN=${accessToken}`,
    `export GITHUB_OWNER=${owner}`,
    `export GITHUB_REPO=${repo}`,
    "export GITHUB_COMMENT_TYPE=pr",
    `export GITHUB_PR_ISSUE_NUMBER=${number}`,
    `export GITHUB_COMMENT="${comment}"`,
    "github-commenter"
  ];

  return job;
}

// Handle local test run
events.on('exec', (e, project) => {
  let namespace = helmDeployNamespace;
  let release = `${projectHelmReleaseBase}-dev`;
  let gitCommit = 'dev';
  let gitBranch = 'dev';
  let imageTag = 'dev';
  let ingressHost = `dev.${projectRootDomain}`;

  buildPushImage(project, projectImageRepo, imageTag).run()
    .then(() => {
      deployHelm(project, namespace, release, gitCommit, gitBranch, imageTag, ingressHost).run();
    });
});

// Handle push event
events.on('push', (e, project) => {
  let gitCommit = e.revision.commit;
  let gitBranch = e.revision.ref.split('/').pop();
  console.log(`received push event for commit ${gitCommit} (branch ${gitBranch})`);

  let namespace = helmDeployNamespace;
  let release = projectHelmReleaseBase;
  let imageTag = gitBranch;
  let ingressHost = projectRootDomain;
  if (gitBranch !== 'master') {
    ingressHost = `${gitBranch}.${ingressHost}`;
    release = `${release}-branch-${gitBranch}`;
  }

  buildPushImage(project, projectImageRepo, imageTag).run()
    .then(() => {
      deployHelm(project, namespace, release, gitCommit, gitBranch, imageTag, ingressHost).run();
    });
});

// Handle push request opened event
events.on('pull_request:opened', (e, project) => {
  let gitCommit = e.revision.commit;
  let gitBranch = e.revision.ref.split('/').pop();
  let payload = JSON.parse(e.payload);
  let number = payload['number'];
  console.log(`received pull request opened event for pr ${number}`);

  let imageTag = `pr-${number}`;
  let namespace = helmDeployNamespace;
  let release = `memelordz-${imageTag}`;
  let ingressHost = `${imageTag}.${projectRootDomain}`;

  buildPushImage(project, projectImageRepo, imageTag).run()
    .then(() => {
      deployHelm(project, namespace, release, gitCommit, gitBranch, imageTag, ingressHost).run()
        .then(() => {
          let comment = `Your change has been deployed: https://${ingressHost}`;
          commentOnGithubPR(project, projectGithubOwner, projectGithubRepo, number, comment).run()
        });
    });
});

// Handle push request closed event
events.on('pull_request:closed', (e, project) => {
  let payload = JSON.parse(e.payload);
  let number = payload['number'];
  console.log(`received pull request closed event for pr ${number}`);

  let release = `memelordz-pr-${number}`;
  undeployHelm(project, release).run();
});
