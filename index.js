const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");

async function run() {
  function bytesToSize(bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 Byte";
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
  }
  try {
    // --------------- octokit initialization  ---------------
    const token = core.getInput("token");
    console.log("Initializing oktokit with token", token);
    const octokit = new github.GitHub(token);
    // --------------- End octokit initialization ---------------

    // --------------- Build repo  ---------------
    const bootstrap = core.getInput("bootstrap"),
      build_command = core.getInput("build_command"),
      dist_path = core.getInput("dist_path"),
      compare_reg = new RegExp(core.getInput("compare"));
    const get_name_token = (item_name) => {
      if (item_name.match(compare_reg)) {
        const tokens = compare_reg.slice(1);
        if (tokens.length > 0) {
          return tokens.join("_");
        }
      }
      return null;
    };
    console.log(`Bootstrapping repo`);
    await exec.exec(bootstrap);

    console.log(`Building Changes`);
    await exec.exec(build_command);

    core.setOutput("Building repo completed @ ", new Date().toTimeString());

    // --------------- End Build repo  ---------------

    // --------------- Comment repo size  ---------------
    const outputOptions = {};
    let sizeCalOutput = "";

    outputOptions.listeners = {
      stdout: (data) => {
        sizeCalOutput += data.toString();
      },
      stderr: (data) => {
        sizeCalOutput += data.toString();
      },
    };
    await exec.exec(`du ${dist_path}`, null, outputOptions);
    core.setOutput("size", sizeCalOutput);
    const context = github.context,
      pull_request = context.payload.pull_request;

    const arrayOutput = sizeCalOutput.split("\n");
    let result = "Bundled size for the package is listed below: \n \n";
    let before = {};
    let after = {};
    arrayOutput.forEach((item) => {
      const i = item.split(/(\s+)/);
      if (item && compare_reg.test(item)) {
        const token = get_name_token(i[2]);
        if (token) {
          after[token] = {
            token,
            name: i[2],
            size: parseInt(i[0]) * 1000,
          };
          result += `**${i[2]}**: ${bytesToSize(parseInt(i[0]) * 1000)} \n`;
        } else {
          console.wran("cannot get token of item:", item);
        }
      } else {
        console.log("ignored item: ", i[2]);
      }
    });
    result += "\n" + JSON.stringify(after, undefined, "  ");
    if (pull_request) {
      console.log(pull_request);
      // on pull request commit push add comment to pull request
      octokit.issues.createComment(
        Object.assign(Object.assign({}, context.repo), {
          issue_number: pull_request.number,
          body: result,
        })
      );
    } else {
      // on commit push add comment to commit
      octokit.repos.createCommitComment(
        Object.assign(Object.assign({}, context.repo), {
          commit_sha: github.context.sha,
          body: result,
        })
      );
    }

    // --------------- End Comment repo size  ---------------
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
