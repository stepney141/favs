import * as fs from 'fs';

export class Utility {

    // 指定した時間(ms)だけ処理を停止する
    async sleep(time) {
        // ref: https://qiita.com/albno273/items/c2d48fdcbf3a9a3434db
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, time);
        });
    }

    // jsonのファイル出力（writeFile使用）
    async fileOutputJson (data, dirname, filename) {
        try {
            const fixedData = JSON.stringify(data, null, "  ");
            if (!fs.existsSync(dirname)) {
                fs.mkdirSync(dirname);
            }
            await fs.writeFile(
                `${dirname}/${filename}`,
                fixedData,
                (e) => {
                    if (e) console.log("error: ", e);
                }
            );
        } catch (e) {
            console.log("error: ", e.message);
            return false;
        }
        console.log(`File Output Completed: ${dirname}/${filename}`);
        return true;
    }

    // jsonのファイル出力（createWriteStream使用）
    async fileOutputStreamJson(dataArray, dirname, filename) {
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname);
        }
        const stream = fs.createWriteStream(`${dirname}/${filename}`);
        for (const index in dataArray) {
            stream.write(dataArray[index]);
            console.log(`Now Streaming: Completed Step ${index+1}/${dataArray.length()}`);
        }
        stream.end('\n');
        stream.on('finish', () => {
            console.log(`File Stream Output Completed: ${dirname}/${filename}`);
            return true;
        });
        stream.on('error', (e) => {
            if (e) console.log("error: ", e);
            return false;
        });
    }

    // バイナリデータのファイル出力
    async fileOutputBinary(data, dirname, filename) {
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname);
        }
        // ref: https://qiita.com/n0bisuke/items/26ce42781f00bb43beec
        fs.writeFileSync(`${dirname}/${filename}`, new Buffer.from(data), 'binary');
        console.log(`File Output Completed: ${dirname}/${filename}`);
        return true;
    }

    // バイナリデータのファイル出力（createWriteStream使用）
    async fileOutputStreamBinary(data, dirname, filename) {
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname);
        }
    }
}