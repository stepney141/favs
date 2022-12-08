import fs from 'fs';
import { Deviantart } from './deviantartClass.js';
import { Utility } from './utilityClass.js';

const da = new Deviantart();
const util = new Utility();

const { CLIENT_ID, CLIENT_SECRET, USERNAME } = JSON.parse(fs.readFileSync('./env.json'));

// 指定したfavouritesフォルダに格納されているdeviationを全て取得
const downloadDeviantsJson_generator = async function* (token, [folder_uuid, folder_name]) {
  let loop_index = 1;
  let offset_next = 0;

  while (true) {
    // jsonを取得
    let collection_contents_json = await da.getContentsInCollection(token, folder_uuid, offset_next);
        
    // jsonをファイルに書き出し
    await util.fileOutputJson(collection_contents_json, `./json/${folder_name}`, `contents_test_${folder_name}_no${loop_index}.json`);
        
    // 5秒待つ
    await util.sleep(5000);

    // jsonに含まれる次のoffsetを取得
    if (collection_contents_json.has_more) {
      offset_next = collection_contents_json.next_offset;
    }

    for (let single_request of collection_contents_json) {
      yield single_request;
      loop_index++;
    }
  }
};

const downloadDeviantsJson = async (token, [folder_uuid, folder_name]) => {
  let loop_index = 1;
  let offset_next = 0;
  let collection_contents_json;
  do {
    collection_contents_json = await da.getContentsInCollection(token, folder_uuid, offset_next);
    await util.fileOutputJson(collection_contents_json, `./json/${folder_name}`, `contents_test_${folder_name}_no${loop_index}.json`);
    await util.sleep(5000);
    if (collection_contents_json.has_more) {
      offset_next = collection_contents_json.next_offset;
      loop_index++;
    }
  } while (collection_contents_json.has_more);
};

// 指定したUUIDのdeviationをオリジナル画質でダウンロード（可能なものに限る）
const getOriginalImageSingle = async (token, deviation_uuid) => {
  const deviant_object = 'ダウンロードしたいdeviationのjsonをここに何らかの形で格納する。引数として渡すべき？';
  if (deviant_object.is_downloadable == true) {
    const image_binary = await da.getDeviationOriginalImage(token, deviation_uuid);
    await util.fileOutputBinary(image_binary, './img', `${deviation_uuid}.png`);
  }
};

const getDeviantsJson = async (token) => {

  // 指定したユーザーのfavouritesフォルダの一覧を取得
  const favourites_folders = await da.getCollectionFolders(token, USERNAME);
  await util.fileOutputJson(favourites_folders, './json', 'folders_test.json');
    
  // 各favouritesフォルダのUUIDとフォルダ名の情報を取り出し、配列にする
  const folder_info = favourites_folders.results.map(element =>  [element.folderid, element.name]);

  // 全てのfavouritesフォルダに格納されているdeviationを全て取得
  for (const array of folder_info) {
    await downloadDeviantsJson(token, array);
    // for await (const single_request of downloadDeviantsJson_generator(token, array));
  }
    
};

// 画像保存テストのUUID(直接ダウンロード可能)
const image_uuid_downloadable = '72517C15-5031-2EFC-2BE5-D45F96B03990';
// 小説保存テストのUUID
const novel_uuid = 'F5CCB77D-EFA5-F7BB-6803-21A4D2CBEC34';
// 動画保存テストのUUID
const movie_uuid = '動画保存テストのUUID';
// 画像保存テストのUUID（gif画像）
const image_uuid_gif = '画像保存テストのUUID（gif画像）';

(async () => {

  // OAuth2 Client Credentials認証でBearer Tokenを取得
  const token = await da.oauth2ClientCredentials(CLIENT_ID, CLIENT_SECRET);

  await getDeviantsJson(token);

  /*

    // 指定したUUIDのdeviationをオリジナル画質でダウンロード（可能なものに限る）
    const deviationOriginalImage = await da.getDeviationOriginalImage(token, '72517C15-5031-2EFC-2BE5-D45F96B03990');
    await util.fileOutputBinary(deviationOriginalImage, './img', '72517C15-5031-2EFC-2BE5-D45F96B03990.png');

    // 指定したUUIDのdeviation objectを取得
    const devObj = await da.getDeviationObj(token, '72517C15-5031-2EFC-2BE5-D45F96B03990');

    // 指定したUUIDのjournal/literature deviationの情報を取得
    const fullContent = await da.getDeviationContent(token, novel_uuid);
    await util.fileOutputJson(fullContent, './json', 'contents_test_lit.json');

    */

})();
