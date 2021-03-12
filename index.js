const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");
const fs = require("fs");
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
    const listFiles = (dir) => {
      try {
        return fs
          .readdirSync(dir, { withFileTypes: true })
          .flatMap((dirent) => {
            const path = `${dir}/${dirent.name}`;
            const stats = fs.statSync(path);
            return dirent.isFile()
              ? [
                  {
                    path,
                    size: stats.size,
                  },
                ]
              : listFiles(path);
          });
      } catch (e) {
        return [dir];
      }
    };

    const files = listFiles(dist_path.replace(/\/$/, ""));

    const context = github.context,
      pull_request = context.payload.pull_request;

    let result = "Bundled size for the package is listed below: \n \n";
    let before = {};
    let after = {};
    files.forEach((file) => {
      if (compare_reg.test(file.path)) {
        const token = get_name_token(file.path);
        if (token) {
          after[token] = {
            token,
            name: file.path,
            size: file.size,
          };
          result += `**${file.name}**: ${bytesToSize(file.size)} \n`;
        } else {
          console.wran("cannot get token of item:", file.path);
        }
      } else {
        console.log("ignored item: ", file.path);
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
