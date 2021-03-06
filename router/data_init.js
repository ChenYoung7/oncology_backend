const router = require('koa-router')();
const db = require('../db/index');
const fs = require('fs');
const path = require('path');
const xlsx = require('node-xlsx');
const PY_translator=require('pinyin');
const csv = require('csvjson');
const iconv = require('iconv-lite');
const first_home_page = require('../db/first_affiliated');

router.get('/oa/init_weight' ,async (ctx, next) => {
       await init_weight().then(async (res) => {
        console.log('after db', res);
        let csv_buffer = Buffer.from(fs.readFileSync(path.join(__dirname, '../data/height_Weight.csv') , {encoding: 'binary'}), 'binary');
        let csv_file = iconv.decode(csv_buffer, 'GBK');
        const options = {
            delimiter: ',',
            quote: '"'
        };
        const Data_section = csv.toObject(csv_file, options).slice(30, 39);
        await save_weight(get_height_data(Data_section)).then(res => {
            console.log('success', res);
            ctx.body = {status: '存储成功'};
        }).catch(e => {
            console.log('failed', e);
            ctx.body = {status: '存储失败'};
        });

    }).catch((e) => {
        console.log(e);
        ctx.body = {state: res};
    });

});

 const get_height_data = (data) => {
     const format_data = [];
     const data_object = {};
     data.forEach(item => {
         const { PATIENT_ID, VITAL_SIGNS_VALUES } = item;
         data_object[PATIENT_ID] = VITAL_SIGNS_VALUES;
     });
    Object.keys(data_object).forEach(key => {
        format_data.push([key, data_object[key]])
    });
     return format_data;
 };

 async function init_weight () {
    let sql = `create table if not exists WEIGHT(zyh INT, weight INT, PRIMARY KEY(zyh)) CHARSET=utf8;`;
    return await db.query(sql);
}

 async function save_weight (data) {
     let sql = `INSERT INTO WEIGHT (zyh, weight) VALUES ?`;
     return await db.query(sql, [data]);
 }


// 一附院病案首页表建立
router.get('/oa/init_home', async(ctx, next) => {
    const home_page_type = first_home_page.home_page_type;
    home_page_type.unshift('INT unsigned not null auto_increment');

    const home_data = fs.readFileSync(path.join(__dirname, '../data/first_home_page.xls'));
    const json_data = xlsx.parse(home_data);
    const original_title = json_data[0].data[0];
    original_title.shift();
    const letter_title = [];
    original_title.forEach(item => {
       item = `part1_${PY_translator(item, {style: PY_translator.STYLE_FIRST_LETTER})}`;
       let letter_item = item.split(',').join('');
       letter_title.push(letter_item);
    });

    letter_title.unshift('part1_pid');

    const sql_array = [];
    letter_title.forEach((title, index) => {
       sql_array.push(`${title} ${home_page_type[index]}`);
    });
    sql_array.push('PRIMARY KEY (part1_pid)');
    const sql = `CREATE TABLE IF NOT EXISTS FIRST_HOME (${sql_array.join(',')}) ENGINE=InnoDB AUTO_INCREMENT=1 CHARSET=utf8;`;
    await db.query(sql).then((res) => {
        ctx.body = {status: '一附院病案首页建表成功'};
    }).catch(e => {
       ctx.body = {status: '一附院病案首页初始化失败'};
    });
});

 // 一附院病案首页数据载入
 router.get('/oa/load_home', async(ctx, next) => {
     const home_data = fs.readFileSync(path.join(__dirname, '../data/first_home_page.xls'));
     const json_data = xlsx.parse(home_data)[0].data;
     const title_array = [];
     json_data[0].shift();
     json_data[0].forEach(title => {
         const letter_title = `part1_${PY_translator(title, {style: PY_translator.STYLE_FIRST_LETTER})}`;
         title_array.push(letter_title.split(',').join(''));
     });
     json_data.shift();
     json_data.forEach(item => {
         item.shift();
     });
     const load_data = json_data.slice(0, 100);
     const sql = `INSERT INTO FIRST_HOME (${title_array.join(',')}) VALUES ?`;
     await db.query(sql, [load_data]).then((res) => {
         ctx.body = {status: '一附院病案首页存储成功'};
     }).catch(e => {
         ctx.body = {status: '存储失败'}
     })
 });

 // 初始化二附院病案首页与费用表
 router.get('/oa/init_home_2', async(ctx, next) => {
    const home_data = fs.readFileSync(path.join(__dirname, '../data/second_home_key.xlsx'));
    const json_data = xlsx.parse(home_data)[0].data;
    const filtered_data = [];
    json_data.forEach(item => {
        if (item.length !== 0) {
            filtered_data.push({
                name: item[0],
                type: item[1]
            })
        }
    });
    // 从键值表second_home_key中，拿出数据字段名称与类型

    filtered_data.splice(0, 2);
    //去掉多余的几行

    let transed_data = filtered_data.map((item,index) => {
        let part = index > 31 ? 'part2' : 'part1';
        let name = `${part}_${PY_translator(item.name, {style: PY_translator.STYLE_FIRST_LETTER})}`;
        let format_name = name.split(',').join('');
        return {
            name: format_name,
            type: generateType(item.type)
        };
    });
    // 生成对应的首字母键值和存储类型，不同部分有不同的part值

    const home_page_data = transed_data.slice(0, 32).map(item => {
        return `${item.name} ${item.type}`
    });
    const fee_data = transed_data.slice(32).map(item => {
        return `${item.name} ${item.type}`
    });
    // 将此数组转换为键值-类型

    home_page_data.unshift(`part1_pid INT unsigned not null auto_increment`);
    home_page_data.push('PRIMARY KEY (part1_pid)');
    fee_data.unshift(home_page_data[1]);
    fee_data.push(`PRIMARY KEY (part1_bah)`);
    const home_sql = `CREATE TABLE IF NOT EXISTS SECOND_HOME (${home_page_data.join(',')}) ENGINE=InnoDB AUTO_INCREMENT=1 CHARSET=utf8;`;
    const fee_sql = `CREATE TABLE IF NOT EXISTS SECOND_FEE (${fee_data.join(',')}) ENGINE=InnoDB AUTO_INCREMENT=1 CHARSET=utf8;`;
    // 处理生成存储语句

    const init_home_db = await db.query(home_sql);
    const init_fee_db = await db.query(fee_sql);

    Promise.all([init_home_db,init_fee_db]).then((res) => {
        ctx.body = {status: '首页与费用数据建表成功'}
    }).catch((e) => {
        ctx.body = {status: '建表失败'};
    })
 });

 router.get('/oa/load_home_2', async(ctx, next) => {
    const home_data =  fs.readFileSync(path.join(__dirname, '../data/second_home_data_format.xlsx'));
     const json_home_data = xlsx.parse(home_data)[0].data;
     const json_fee_data = xlsx.parse(home_data)[1].data;
     const home_key = json_home_data[0].map(item => {
         const key = `part1_${PY_translator(item, {style: PY_translator.STYLE_FIRST_LETTER})}`;
         return key.split(',').join('');
     });
     const fee_key = json_fee_data[0].map(item => {
         const key = `part2_${PY_translator(item, {style: PY_translator.STYLE_FIRST_LETTER})}`;
         return key.split(',').join('');
     });
     fee_key[0] = 'part1_bah';
     // 存储数据前，先整理出所有数据对应的键值，并对特殊情况进行处理，如费用表中的主键part1_bah

     const sql_home = `INSERT INTO SECOND_HOME (${home_key.join(',')}) VALUES ?`;
     const sql_fee = `INSERT INTO SECOND_FEE (${fee_key.join(',')}) VALUES ?`;
     const save_home_data = json_home_data.slice(1, 20);
     const save_fee_data = json_fee_data.slice(1, 20);
     save_home_data.forEach(item => {
         if (item.length === 31)
         item.push('-');
     });
     // **生成存储的sql语句，特别说明xlsx插件对于一行数据的最后一个非空值会认为是最后一项，所以这里得进行补全操作。

     const home_db = await db.query(sql_home, [save_home_data]);
     const fee_db = await db.query(sql_fee, [save_fee_data]);
     Promise.all([home_db,fee_db]).then((res) => {
         ctx.body = {status: '首页与费用数据导入成功'}
     }).catch((e) => {
         console.log(e);
         ctx.body = {status: '导入失败'};
     })
 });

generateType = (type) => {
    switch (type) {
        case '数字':
            return 'INT';
        case '长数字':
            return 'BIGINT';
        case '长字符串':
            return 'VARCHAR(300)';
        case '字符串':
            return 'VARCHAR(120)';
        case '数值':
            return 'INT';
        case '时间':
            return 'VARCHAR(60)';
        case '小数字':
            return 'DECIMAL(10, 2)';
        default:
            return 'TEXT'
    }
};
module.exports = router;