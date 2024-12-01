import path from "path";

import { Octokit } from "@octokit/rest";
import { config } from "dotenv";

import { exportFile } from "../.libs/utils";

const JOB_NAME = "GitHub Starred Repositories";

config({ path: path.join(__dirname, "../.env") });
const token = process.env.OAUTH_TOKEN_OF_GITHUB!;

type Gist = {
  description: string | null;
  html_url: string;
  created_at: string;
};
type Starred = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
};

const createClient = () => new Octokit({ auth: token });

const getStarredGists = async (app: Octokit): Promise<Gist[]> => {
  // https://docs.github.com/en/rest/gists/gists#list-starred-gists
  const iterator = app.paginate.iterator("GET /gists/starred", { per_page: 100 });

  const gists_json: Gist[] = [];
  for await (const { data: gists } of iterator) {
    for (const gist of gists) {
      gists_json.push({
        description: gist.description,
        html_url: gist.html_url,
        created_at: gist.created_at
      });
    }
  }

  return gists_json;
};

const getStarredRepos = async (app: Octokit): Promise<Starred[]> => {
  // https://docs.github.com/en/rest/activity/starring#list-repositories-starred-by-the-authenticated-user
  const iterator = app.paginate.iterator("GET /user/starred", { per_page: 100 });

  const stars_json: Starred[] = [];
  for await (const { data: stars } of iterator) {
    for (const star of stars) {
      stars_json.push({
        full_name: star.full_name,
        html_url: star.html_url,
        description: star.description,
        stargazers_count: star.stargazers_count
      });
    }
  }

  return stars_json;
};

(async () => {
  try {
    const startTime = Date.now();
    const app = createClient();

    const gists_list_filename = "starred_gists.csv";
    console.log(`${JOB_NAME}: ${gists_list_filename}`);
    const gists_json = await getStarredGists(app);
    await exportFile({
      fileName: gists_list_filename,
      payload: gists_json,
      targetType: "csv",
      mode: "overwrite"
    }).then(() => {
      console.log(`${JOB_NAME}: Finished writing ${gists_list_filename}`);
    });

    const stars_list_filename = "starred_repos.csv";
    console.log(`${JOB_NAME}: ${stars_list_filename}`);
    const stars_json = await getStarredRepos(app);
    await exportFile({
      fileName: stars_list_filename,
      payload: stars_json,
      targetType: "csv",
      mode: "overwrite"
    }).then(() => {
      console.log(`${JOB_NAME}: Finished writing ${gists_list_filename}`);
    });

    console.log(`${JOB_NAME}: CSV Output Completed!`);
    console.log(`The processs took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
  } catch (e) {
    console.log(e);
  }
})();
