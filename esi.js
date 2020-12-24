const env = require('dotenv').config({path: __dirname + '/.env'}).parsed
const SwaggerClient = require('swagger-client')
const { MongoClient } = require('mongodb')
const Discord = require('discord.js')
const dcClient = new Discord.Client()
const fs = require('fs')
const { exit } = require('process')
let channel = null

const client = new MongoClient('mongodb://localhost:27017/?readPreference=primary&useUnifiedTopology=true&ssl=false')

const monthStringToTime = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12'

}


function transformDate(dateString) {
    let result = dateString.match(/(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/)
    return result[1] + '-' + result[2] + '-' + result[3] + ' ' + result[4] + ':' + result[5]
}

var etag = ''

if (fs.existsSync('etag.txt')) {
    etag = fs.readFileSync('etag.txt').toString()
}


let swagger = new SwaggerClient('https://esi.evetech.net/_latest/swagger.json?datasource=tranquility').then(async (swagger) => {
    let request = {
        url: 'https://esi.evetech.net/v2/universe/system_kills/',
        mode: 'cors',
        method: 'GET',
        headers: {
            'If-None-Match': etag,
        },
    }
    SwaggerClient.http(request)
        .then((response) => {
            dcClient.on('ready', () => {
                console.log("Connected as " + dcClient.user.tag)
                channel = dcClient.channels.cache.find(channel => channel.id === '786903866166870016')
                etag = response.headers.etag
                fs.writeFileSync('etag.txt', etag)
                //process data here
                let data = response.body
                let datetime = response.headers["last-modified"][1].split(' ')
                let time = datetime[3].split(':')
                let timestamp = datetime[2] + monthStringToTime[datetime[1]] + datetime[0] + time[0] + time[1]
                channel.send('Processing data for `' + transformDate(timestamp) + '`...')
                client.connect().then(() => {
                    let limit = data.length
                    let counter = 0
                    data.forEach(element => {
                        client.db('esidata').collection('npckills').findOne({ system_id: element.system_id })
                            .then((response) => {
                                if (response === null) {
                                    timeline = {}
                                    timeline[timestamp] = element.npc_kills
                                    client.db('esidata').collection('npckills').insertOne({
                                        _id: element.system_id,
                                        system_id: element.system_id,
                                        data: timeline
                                    })
                                        .then((response) => {
                                            console.log('Sucess for ' + response.insertedId)
                                        })
                                        .catch((response) => {
                                            console.log('Failure: ' + response)
                                        })
                                } else {
                                    timeline = response.data
                                    timeline[timestamp] = element.npc_kills
                                    client.db('esidata').collection('npckills').updateOne({
                                        _id: element.system_id,
                                        system_id: element.system_id
                                    }, {
                                        $set: { data: timeline }
                                    })
                                }
                                counter++
                                if (counter === limit) {
                                    channel.send('Data processing for `' + transformDate(timestamp) + '` done').then(() => {
                                        dcClient.destroy()
                                        exit()
                                    })
                                }
                            })
                            .catch((response) => {
                                console.log(response)
                                counter++
                                if (counter === limit) {
                                    channel.send('Data processing for `' + transformDate(timestamp) + '` done').then(() => {
                                        dcClient.destroy()
                                        exit()
                                    })
                                }
                            })
                    })
                })
                .catch((error) => {
                    console.log(error)
                })
            })
            dcClient.login(env.BOT_TOKEN)
        })
        .catch((response) => {
            if (response.status === 304) {
                console.log('Skipping pull due to 304 status code')
                etag = response.response?.headers.etag
                fs.writeFileSync('etag.txt', etag)
                dcClient.destroy()
            }
        })

})