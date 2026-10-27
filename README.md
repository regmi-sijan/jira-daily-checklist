# Jira Daily Checklist

A Forge app that turns a personal reusable checklist into Jira Tasks. It creates one issue per saved template item each day, tracks each day's issues for reference, and moves an issue to a Jira status in the Done category when its checkbox is checked. Unchecking attempts to return the issue to the status it had before completion; if the Jira workflow does not allow that transition, the app leaves the checkbox unchanged and reports the reason.

Template and history data are stored separately for each Jira site and signed-in Atlassian account. Issues are created and transitioned as the current user, so that user needs the relevant project permissions.

## Requirements

- Node.js 20 or newer and npm
- An Atlassian Cloud Jira site
- Atlassian Forge CLI access (`npx @forge/cli --version` to check availability)
- The selected project must allow the current user to create **Task** issues
- Its Jira workflow must expose a transition to a status in the **Done** category

## Build, register, and install

1. Install dependencies and build the Custom UI bundle:

   ```sh
   npm install
   npm run build
   ```

2. Authenticate the Forge CLI:

   ```sh
   npx @forge/cli login
   ```

3. Register this app with your Atlassian developer account. Forge writes the app's unique ID into `manifest.yml`:

   ```sh
   npx @forge/cli register
   ```

4. Deploy to the development environment and install it on your Jira site:

   ```sh
   npx @forge/cli deploy -e development
   npx @forge/cli install -e development
   ```

   Choose Jira when prompted and approve the requested Jira read/write and app-storage permissions.

5. In Jira, open **Apps → Daily Checklist**. Select a project, add routine items, and save the template. Choose **Generate today** to create the corresponding Jira Tasks. Checking an item transitions its Jira issue to Done.

After changing the manifest or app code, run `npm run build` and deploy again. If permissions changed, upgrade/reinstall the app when Forge prompts you.

## Local checks

```sh
npm test
npm run build
```

The app cannot be deployed or connected to a Jira site until a developer account is authenticated, the app is registered, and the required permissions are granted.
