# Publishing checklist

Use this as an operator runbook (not required for end users).

## Pre-flight

- [ ] `npm ci && npm test && npm run package` succeeds locally  
- [ ] `package.json` `version` bumped (semver) for each release  
- [ ] [CHANGELOG.md](CHANGELOG.md) updated  

## Visual Studio Marketplace

**Live:** [newmatik.altium-schdoc-viewer](https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer) · [Publisher hub](https://marketplace.visualstudio.com/manage/publishers/newmatik/extensions/altium-schdoc-viewer/hub)

Updates: bump `package.json` version, then `npx @vscode/vsce publish`. First-time: [PAT](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token) (Marketplace **Manage**), `npx @vscode/vsce login newmatik`.

Docs: [Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Open VS X Registry

1. [Open VSX account + token](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions).  
2. `npx ovsx publish -p <token>`  

## GitHub Release + VSIX

1. `npm run package`  
2. Create a GitHub Release, attach `altium-schdoc-viewer-<version>.vsix`  
3. Users: **Install from VSIX…**

## CI artifact (optional)

Add a workflow step to upload the VSIX as a workflow artifact or attach it to releases with [softprops/action-gh-release](https://github.com/softprops/action-gh-release) when you tag.
