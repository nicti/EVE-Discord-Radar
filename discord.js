const env = require('dotenv').config({ path: __dirname + '/.env' }).parsed
const statics = require('./func/static')
const { MongoClient } = require('mongodb')
const Discord = require('discord.js')
const client = new Discord.Client()
const SwaggerClient = require('swagger-client')
const canvasToBuffer = require('canvas-to-buffer')
const vegalite = require('vega-lite')
const vega = require('vega')
const { isNumeric } = require('vega-lite')

const mongoClient = new MongoClient('mongodb://localhost:27017/?readPreference=primary&useUnifiedTopology=true&ssl=false')
mongoClient.connect().then(() => { console.log('MongoDB connected!') })

let idArray = {}
let swagger
new SwaggerClient('https://esi.evetech.net/_latest/swagger.json?datasource=tranquility').then((s) => {
  swagger = s
  idArray = statics.gatherIdData(s)
})

const numbers = {
  1: '1️⃣',
  2: '2️⃣',
  3: '3️⃣',
  4: '4️⃣',
  5: '5️⃣',
  6: '6️⃣',
  7: '7️⃣',
  8: '8️⃣',
  9: '9️⃣'
}

let idArrayBuilding = false

client.on('ready', () => {
  console.log("Connected as " + client.user.tag)
})

client.on('message', (receivedMessage) => {
  if (receivedMessage.author == client.user) {
    return
  }
  let messageParts = receivedMessage.content.split(' ')
  if ((messageParts.length === 2 || messageParts.length === 3)&& messageParts[0] === '!radar') {
    receivedMessage.channel.startTyping()
    if (messageParts[1].length <= 2) {
      receivedMessage.channel.send(receivedMessage.author.toString() + ' Please use a search term of 3 letters or more!')
      receivedMessage.reactions.removeAll()
      return
    }
    let limit = 0
    if (isNumeric(messageParts[2])) {
      limit = praseInt(messageParts[2])
    }
    swagger.apis.Search.get_search({
      'search': messageParts[1],
      'categories': 'constellation,region,solar_system'
    }).then((response) => {
      let regions = []
      if (response.body.region) {
        regions = response.body.region
      }
      let consts = []
      if (response.body.constellation) {
        consts = response.body.constellation
      }
      let systems = []
      if (response.body.solar_system) {
        systems = response.body.solar_system
      }
      let ids = regions.concat(consts).concat(systems)
      if (ids.length === 1) {
        let text = process(ids[0], idArray[ids[0]].name, receivedMessage.channel, limit)
      } else if (ids.length > 9) {
        receivedMessage.channel.send('Too many results, please specify your search!')
      } else if (ids.length === 0) {
        receivedMessage.channel.send('No results, please adapt your search!')
      } else {
        let counter = 1
        let filterable = []
        let msg = 'Found the following, please react accordingly:\r'
        if (regions && regions.length > 0) {
          msg += 'Regions:```';
          regions.forEach(element => {
            msg += numbers[counter] + ' ' + idArray[element].name + '\r'
            filterable.push({
              num: counter,
              id: element,
              name: idArray[element].name,
              type: 'region'
            })
            counter++
          });
          msg += '```'
        }
        if (consts && consts.length > 0) {
          msg += 'Constellations:```'
          consts.forEach(element => {
            msg += numbers[counter] + ' ' + idArray[element].name + '\r'
            filterable.push({
              num: counter,
              id: element,
              name: idArray[element].name,
              type: 'constellation'
            })
            counter++
          });
          msg += '```'
        }
        if (systems && systems.length > 0) {
          msg += 'Systems:```'
          systems.forEach(element => {
            msg += numbers[counter] + ' ' + idArray[element].name + '\r'
            filterable.push({
              num: counter,
              id: element,
              name: idArray[element].name,
              type: 'system'
            })
            counter++
          });
          msg += '```'
        }
        receivedMessage.channel.send(msg).then((response) => {
          for (let i = 1; i < counter; i++) {
            response.react(numbers[i])
          }
          const filter = (reaction, user) => {
            return ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'].includes(reaction.emoji.name) && user.id === receivedMessage.author.id
          }
          response.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
            .then(collected => {
              response.reactions.removeAll()
              const reaction = collected.first()
              let filterableNum = Object.keys(numbers).find(key => numbers[key] === reaction.emoji.name)
              let result = filterable.find((value) => {
                return value.num == filterableNum
              })
              let text = process(result.id, result.name, receivedMessage.channel, limit)
            })
        })
      }
    })
    receivedMessage.channel.stopTyping()
  } else if (messageParts[0] === '!radar') {
    receivedMessage.channel.send('Usage: `!radar <search> [<days>]`')
  }
})


function process(id, name, channel, limit) {
  // determine type of id
  switch (idArray[id].type) {
    case 'region':
      swagger.apis.Universe.get_universe_regions_region_id({'region_id': id})
      .then((response) => {
        let constellationNames = []
        response.body.constellations.forEach(element => {
          constellationNames.push(idArray[element].name)
        })
        channel.send('Gathering data for `' + idArray[id].name + '`:`' + constellationNames.join('`,`') + '`...')
        channel.send('⚠️ Gathering for regions is currently not available ⚠️')
      })
      break;
    case 'constellation':
      swagger.apis.Universe.get_universe_constellations_constellation_id({ 'constellation_id': id })
        .then((response) => {
          let systemNames = []
          response.body.systems.forEach(element => {
            systemNames.push(idArray[element].name)
          });
          channel.send('Gathering data for `' + idArray[id].name + '`:`' + systemNames.join('`,`') + '`...')
          let values = []
          counter = 0
          response.body.systems.forEach(element => {
            mongoClient.db('esidata').collection('npckills').findOne({ system_id: element })
              .then((responseData) => {
                if (responseData !== null) {
                  Object.keys(responseData.data).forEach(key => {
                    if (key === 'timestamp') {
                      //Skip of old data
                    } else {
                      if (values.length) {
                        let lastHour = getHour(values[values.length-1].Timestamp)
                        let currentHour = getHour(transformDate(key))
                        let a = 'b'
                        while (parseInt(hourPlusOne(lastHour)) !== currentHour) {
                          values.push({ "Timestamp": getHourPlusOne(values[values.length-1].Timestamp), "NPC Kills": 0, "System": name })
                          lastHour = getHour(values[values.length-1].Timestamp)
                        }
                      }
                      values.push({ "Timestamp": transformDate(key), "NPC Kills": responseData.data[key], "System": idArray[responseData.system_id].name })
                    }
                  })
                }
                counter++
                if (counter === response.body.systems.length) {
                  if (limit !== 0) {
                    values.slice(Math.max(values.length - limit, 0))
                  }
                  let vspec = vegalite.compile({
                    "$schema": "https://vega.github.io/schema/vega-lite/v4.json",
                    "data": {
                      "values": values
                    },
                    "mark": "line",
                    "encoding": {
                      "x": { "field": "Timestamp"},
                      "y": { "field": "NPC Kills", "type": "quantitative" },
                      "color": { "field": "System" }
                    },
                    "width": 2000,
                    "height": 1000
                  }).spec
                  var view = new vega.View(vega.parse(vspec), { renderer: 'none' })
                    .initialize()
                  view.toCanvas().then((canvas) => {
                    channel.send('', {
                      files: [
                        new canvasToBuffer(canvas).toBuffer()
                      ]
                    })
                  }).catch((err) => { console.log(err) })
                }
              });
          })
        })
      break;
    case 'solar_system':
      channel.send('Gathering data for `' + idArray[id].name + '`...')
      mongoClient.db('esidata').collection('npckills').findOne({ system_id: id })
        .then((response) => {
          let values = []
          Object.keys(response.data).forEach(key => {
            if (key === 'timestamp') {
              //Skip of old data
            } else {
              if (values.length) {
                let lastHour = getHour(values[values.length-1].Timestamp)
                let currentHour = getHour(transformDate(key))
                let a = 'b'
                while (parseInt(hourPlusOne(lastHour)) !== currentHour) {
                  values.push({ "Timestamp": getHourPlusOne(values[values.length-1].Timestamp), "NPC Kills": 0, "System": name })
                  lastHour = getHour(values[values.length-1].Timestamp)
                }
              }
              values.push({ "Timestamp": transformDate(key), "NPC Kills": response.data[key], "System": name })
            }
          })
          if (limit !== 0) {
            values.slice(Math.max(values.length - limit, 0))
          }
          let vspec = vegalite.compile({
            "$schema": "https://vega.github.io/schema/vega-lite/v4.json",
            "data": {
              "values": values
            },
            "mark": "line",
            "encoding": {
              "x": { "field": "Timestamp"},
              "y": { "field": "NPC Kills", "type": "quantitative" },
              "color": { "field": "System" }
            },
            "width": 2000,
            "height": 1000
          }).spec
          var view = new vega.View(vega.parse(vspec), { renderer: 'none' })
            .initialize()
          view.toCanvas().then((canvas) => {
            channel.send('', {
              files: [
                new canvasToBuffer(canvas).toBuffer()
              ]
            })
          }).catch((err) => { console.log(err) })
        })
        .catch((error) => {
          console.log(error)
        })
      break;
  }
}

function transformDate(dateString) {
  let result = dateString.match(/(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/)
  return result[1] + '-' + result[2] + '-' + result[3] + ' ' + result[4] + ':' + result[5]
}

function getHour(dateString) {
  let result = dateString.match(/(\d\d\d\d)\-(\d\d)\-(\d\d) (\d\d)\:(\d\d)/)
  return parseInt(result[4])
}

function getHourPlusOne(dateString) {
  let result = dateString.match(/(\d\d\d\d)\-(\d\d)\-(\d\d) (\d\d)\:(\d\d)/)
  return result[1] + '-' + result[2] + '-' + result[3] + ' ' + hourPlusOne(result[4]) + ':' + result[5]
}

function hourPlusOne(i) {
  let r = parseInt(i)+1
  if (r === 24) {
    return '00'
  }
  return r.toString().padStart(2,'0')
}

client.login(env.BOT_TOKEN)