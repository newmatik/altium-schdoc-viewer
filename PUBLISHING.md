# Publishing checklist

Use this as an operator runbook (not required for end users).

## Pre-flight

- [ ] `npm ci && npm test && npm run package` succeeds locally  
- [ ] `package.json` `version` bumped (semver) for each release  
- [ ] [CHANGELOG.md](CHANGELOG.md) updated  

## Visual Studio Marketplace

1. [Azure DevOps PAT](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token) with **Marketplace (Manage)**.  
2. `npx @vscode/vsce login newmatik` (replace publisher id if different).  
3. `npx @vscode/vsce publish`  

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
