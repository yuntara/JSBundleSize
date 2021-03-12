# JS bundle size

Github action for computing javascript bundle size. It calculates & logs JavaScript code bundled size on each pull request or commit (customizable).
With the help of this action, developers can now log & check the overall code size after compression on per commit basis & take necessary actions.

Upcoming features:
Fail check if bundle size exceeds a specific value.

Stay tuned for more updates!

![How to use JSBundle Size action](https://i.imgur.com/koKtvty.gif)

![github actions bot comment bundle size](https://i.imgur.com/GhElRd1.png)

## Usage:

first, you need checkout base and head

ex.

```yaml
- uses: actions/checkout@master
  with:
    ref: ${{ github.event.pull_request.base.ref }}
- uses: actions/checkout@master
  with:
    ref: ${{ github.event.pull_request.head.ref }}
```

Checkout [action.yml](./action.yml)

Please check the below code for detailed usage:

```yaml
steps:
  - uses: actions/checkout@master
  - uses: sarthak-saxena/JSBundleSize@master
    with:
      bootstrap: <Command for installing dependencies ex npm install>
      build_command: <Command to build/bundle code>
      dist_path: <Output path for your bundle>
      token: ${{ secrets.GITHUB_TOKEN }}
      compare: <Regex to compare filename, matched group are used for file key  ex. (\d+\.chunk).*?.js$ >
      base: <base ref  ex. ${{ github.event.pull_request.base.ref }}>
      head: <head ref  ex. ${{ github.event.pull_request.head.ref }}>
```

By default github actions work on `node 12`.For a specific node version use:

```yaml
- uses: actions/setup-node@v1
        with:
          node-version: '10.0.0'
```

**Ex:**

```yaml
steps:
  - uses: actions/checkout@master
  - uses: actions/setup-node@v1
    with:
      node-version: "10.0.0"
  - uses: sarthak-saxena/JSBundleSize@master
    with:
      bootstrap: npm install
      build_command: npm run build
      dist_path: "dist"
      token: ${{ secrets.GITHUB_TOKEN }}
```

Also check [Demo.yml](./Demo.yml) for complete configuration(on using github actions)

## License

The scripts and documentation in this project are released under the [MIT License](./LICENSE)
