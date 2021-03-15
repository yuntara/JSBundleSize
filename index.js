const core = require("@actions/core");
const exec = require("@actions/exec");
const github = require("@actions/github");
const zlib = require("zlib");
const fs = require("fs");
const { promisify } = require("util");
const { pipeline } = require("stream");
const pipe = promisify(pipeline);

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
      dist_path = core.getInput("dist_path").replace(/\/$/, ""),
      compare_reg = new RegExp(core.getInput("compare")),
      base_ref = core.getInput("base"),
      head_ref = core.getInput("head"),
      compress_type = core.getInput("compress");
    const do_compress = compress_type !== "none";
    const get_name_token = (item_name) => {
      const matches = item_name.match(compare_reg);
      if (matches) {
        const tokens = matches.slice(1);
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
    const get_compress_size = async (path) => {
      if (!do_compress) {
        return 0;
      }
      const tmpname = `${path}.gz`;
      const gzip = zlib.createGzip();
      const source = fs.createReadStream(path);
      const destination = fs.createWriteStream(tmpname);
      await pipe(source, gzip, destination);
      const stats = fs.statSync(tmpname);
      fs.unlinkSync(tmpname);
      return stats.size;
    };
    const get_files = async () => {
      let list = {};
      let total = {
        token: "total size",
        path: null,
        compress_size: 0,
        size: 0,
      };
      const files = listFiles(dist_path);
      for (const file of files) {
        if (compare_reg.test(file.path)) {
          const token = get_name_token(file.path);
          if (token) {
            const compress_size = await get_compress_size(file.path);
            list[token] = {
              token,
              path: file.path,
              size: file.size,
              compress_size,
            };
            total.size += file.size;
            total.compress_size += compress_size;
          } else {
            console.warn("cannot get token of item:", file.path);
          }
        } else {
          console.log("ignored item: ", file.path);
        }
      }
      list["total size"] = total;
      return list;
    };

    const context = github.context,
      pull_request = context.payload.pull_request;

    const after = await get_files();
    console.log("after sizes");
    for (const [key, file] of Object.entries(after)) {
      console.log(`${key} ${file.path} ${file.size} ${file.compress_size}`);
    }
    for (const file of Object.values(after)) {
      if (file.path) {
        fs.unlinkSync(file.path);
      }
    }

    await exec.exec(`git checkout ${base_ref}`);

    console.log(`bootstrap base`);
    await exec.exec(bootstrap);

    console.log(`build base`);

    await exec.exec(build_command);

    const before = await get_files();
    console.log("before sizes");
    for (const [key, file] of Object.entries(before)) {
      console.log(`${key} ${file.path} ${file.size} ${file.compress_size}`);
    }
    await exec.exec(`git checkout ${head_ref}`);
    const keys = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)])
    ).sort((a, b) => {
      if (a === "total size") {
        return 1;
      }
      if (b === "total size") {
        return -1;
      }
      return a.localeCompare(b);
    });
    const make_line = (key, a, b, compressed) => {
      let after_size = a ? (compressed ? a.compress_size : a.size) : 0;
      let before_size = b ? (compressed ? b.compress_size : b.size) : 0;
      let diff = after_size - before_size;
      return `|${key}|${b ? `${bytesToSize(b.size)}` : "none"}|${
        a ? `${bytesToSize(a.size)}` : "none"
      }|${
        after_size > before_size ? "🔴" : after_size < before_size ? "🟢" : "⚪"
      }|${diff > 0 ? "+" : diff < 0 ? "-" : ""}${bytesToSize(Math.abs(diff))}|
`;
    };
    let result = `Bundled size for the package is listed below:

    |key|before|after||size diff|
    |:----:|:----:|:---:|:---:|:---:|
    ${make_line("Total size", after["total_size"], before["total_size"])}${
      do_compress
        ? `\n${make_line(
            "Total size (gzip)",
            after["total_size"],
            before["total_size"],
            true
          )}`
        : ""
    }
    <details>
    <summary>Each bundled size comparison table (raw) </summary>
    
    |key|before|after||size diff|
    |:----:|:----:|:---:|:---:|:---:|
    `;
    for (const key of keys) {
      if (key === "total size") {
        continue;
      }
      let b = before[key];
      let a = after[key];
      result += make_line(key, a, b);
    }
    result += `</details>`;
    if (do_compress) {
      result += `
      <details>
      <summary>Each bundled size comparison table (gzip) </summary>
      
      |key|before|after||size diff|
      |:----:|:----:|:---:|:---:|:---:|
      `;
      for (const key of keys) {
        if (key === "total size") {
          continue;
        }
        let b = before[key];
        let a = after[key];
        result += make_line(key, a, b, true);
      }
      result += `</details>`;
    }
    if (pull_request) {
      // on pull request commit push add comment to pull request
      octokit.issues.createComment(
        Object.assign(Object.assign({}, context.repo), {
          issue_number: pull_request.number,
          body: result,
        })
      );
    } /* else {
      // on commit push add comment to commit
      octokit.repos.createCommitComment(
        Object.assign(Object.assign({}, context.repo), {
          commit_sha: github.context.sha,
          body: result,
        })
      );
    }*/

    // --------------- End Comment repo size  ---------------
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
