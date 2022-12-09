const { Octokit } = require("octokit");
const fs = require("fs/promises");
const papa = require("papaparse");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const token = process.env.OAUTH_TOKEN_OF_GITHUB;

const createClient = () => new Octokit({ auth: token });

const getStarredGists = async (app) => {
  // https://docs.github.com/en/rest/gists/gists#list-starred-gists
  const iterator = app.paginate.iterator("GET /gists/starred", { per_page: 100 });

  let gists_json = [];
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

const getStarredRepos = async (app) => {
  // https://docs.github.com/en/rest/activity/starring#list-repositories-starred-by-the-authenticated-user
  const iterator = app.paginate.iterator("GET /user/starred", { per_page: 100 });

  let stars_json = [];
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

const writeCSV = async (json, filename) => {
  try {
    const csv = papa.unparse(json);
    const filehandle = await fs.open(filename, "w");
    await fs.appendFile(`./${filename}`, csv, (e) => {
      if (e) console.log("error: ", e);
    });
    await filehandle.close();
  } catch (e) {
    console.log(e);
  }
};

const main = async () => {
  const startTime = Date.now();
  const app = createClient();

  const gists_list_filename = "starred_gists.csv";
  const gists_json = await getStarredGists(app);
  await writeCSV(gists_json, gists_list_filename);

  const stars_list_filename = "starred_repos.csv";
  const stars_json = await getStarredRepos(app);
  await writeCSV(stars_json, stars_list_filename);

  console.log("GitHub Starred Repositories: CSV Output Completed!");
  console.log(`The processsing took ${Math.round((Date.now() - startTime) / 1000)} seconds`);
};

(async () => {
  await main();
})();
