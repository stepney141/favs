import fs from 'fs';
import fetch from 'node-fetch';

const { CLIENT_ID, CLIENT_SECRET, USERNAME } = JSON.parse(fs.readFileSync('./env.json'));

export class Deviantart {

  // OAuth2 Client Credential認証でBearer Tokenを取得
  async oauth2ClientCredentials (client_id, client_secret) {
    try {
      const params = {
        grant_type: 'client_credentials',
        client_id: client_id,
        client_secret: client_secret,
      };
      const query = new URLSearchParams(params);
      const response = await fetch('https://www.deviantart.com/oauth2/token',
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: query
        }
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
      }
      return (await response.json()).access_token;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  //指定したBearer Tokenを無効にする
  async oauth2Revoke (token) {
    try {
      const response = await fetch('https://www.deviantart.com/oauth2/revoke',
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: `token=${token}`
        }
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
      }
      return (await response.json());
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  // 指定したユーザーのfavoritesフォルダの一覧をjsonで取得
  async getCollectionFolders (token, username) {
    try {
      const params = {
        username: username,
        calculate_size: true,
        offset: 0,
        limit: 24,
        access_token: token
      };
      const query = new URLSearchParams(params);
      const response = await fetch(`https://www.deviantart.com/api/v1/oauth2/collections/folders?${query}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          }
        }
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
      }
      return (await response.json());
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  // 指定したfavoritesフォルダ内のdeviationの情報をjsonで取得
  async getContentsInCollection (token, folder_uuid, offset = 0) {
    try {
      const params = {
        username: USERNAME,
        offset: offset,
        limit: 24,
        mature_content: true,
        access_token: token
      };
      const query = new URLSearchParams(params);
      const response = await fetch(`https://www.deviantart.com/api/v1/oauth2/collections/${folder_uuid}?${query}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          }
        }
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
      }
      return (await response.json());
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  // 指定したdeviationの画像をオリジナル画質でダウンロード（可能なものに限る）
  async getDeviationOriginalImage (token, deviation_uuid) {
    try {
      const params = {
        mature_content: true,
        access_token: token
      };
      const query = new URLSearchParams(params).toString();

      //apiをコールして画像URLが含まれたjsonを取得
      const response_api = await fetch(`https://www.deviantart.com/api/v1/oauth2/deviation/download/${deviation_uuid}?${query}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          }
        }
      );
      if (!response_api.ok) {
        throw new Error(`${response_api.status} ${response_api.statusText} ${await response_api.text()}`);
      }

      // apiから返ってきたjsonの中に含まれる画像URLへアクセスし、バイナリデータを取得してreturnする
      const response_image = await fetch((await response_api.json()).src,
        {
          method: 'GET',
          // headers: {
          //     'Accept': 'application/json',
          //     'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          // }
        }
      );
      if (!response_image.ok) {
        throw new Error(`${response_image.status} ${response_image.statusText} ${await response_image.text()}`);
      }
      return (await response_image.arrayBuffer());
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  // 指定したdeviation objectを取得
  async getDeviationObj (token, deviation_uuid) {
    try {
      const params = {
        expand: true,
        access_token: token
      };
      const query = new URLSearchParams(params).toString();
      const response = await fetch(`https://www.deviantart.com/api/v1/oauth2/deviation/${deviation_uuid}?${query}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          }
        }
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
      }
      return (await response.json());
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  // 指定したユーザーのfavoritesフォルダの一覧をjsonで取得
  async getDeviationContent (token, deviation_uuid) {
    try {
      const params = {
        deviationid: deviation_uuid,
        mature_content: true,
        access_token: token
      };
      const query = new URLSearchParams(params);
      const response = await fetch(`https://www.deviantart.com/api/v1/oauth2/deviation/content?${query}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          }
        }
      );
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
      }
      return (await response.json());
    } catch (e) {
      console.log(e);
      return false;
    }
  }

}