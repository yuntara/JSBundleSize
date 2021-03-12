const fs = require("fs");
const listFiles = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((dirent) => {
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
function bytesToSize(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}
console.log(bytesToSize(10000));
