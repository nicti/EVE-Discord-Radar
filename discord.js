const statics = require('./func/static')
const {MongoClient} = require('mongodb')
const Discord = require('discord.js')
const client = new Discord.Client()
const SwaggerClient = require('swagger-client')
const vega = require('vega')
const canvasToBuffer = require('canvas-to-buffer')

const mongoClient = new MongoClient('mongodb://localhost:27017/?readPreference=primary&useUnifiedTopology=true&ssl=false')
mongoClient.connect().then(()=>{console.log('MongoDB connected!')})

let idArray = {}
let swagger
new SwaggerClient('https://esi.evetech.net/_latest/swagger.json?datasource=tranquility').then((s) => {
    swagger = s
    idArray = statics.gatherIdData(s)
})

const defaultConfig = {
  "$schema": "https://vega.github.io/schema/vega/v5.json",
  "description": "A basic line chart example.",
  "width": 1000,
  "height": 400,
  "padding": 5,
  "background": '#fff',
  "signals": [
    {
      "name": "interpolate",
      "value": "linear",
      "bind": {
        "input": "select",
        "options": [
          "basis",
          "cardinal",
          "catmull-rom",
          "linear",
          "monotone",
          "natural",
          "step",
          "step-after",
          "step-before"
        ]
      }
    }
  ],
  "legends": [
    {
      "fill": "color",
      "orient": "top-left",
      "encode": {
        "symbols": {"enter": {"fillOpacity": {"value": 0.5}}},
        "labels": {"update": {"text": {"field": "value"}}}
      }
    }
  ],

  "scales": [
    {
      "name": "x",
      "type": "point",
      "range": "width",
      "domain": {"data": "table", "field": "x"}
    },
    {
      "name": "y",
      "type": "linear",
      "range": "height",
      "nice": true,
      "zero": true,
      "domain": {"data": "table", "field": "y"}
    },
    {
      "name": "color",
      "type": "ordinal",
      "range": "category",
      "domain": {"data": "table", "field": "c"}
    }
  ],

  "axes": [
    {
      "orient": "bottom",
      "scale": "x",
      "encode": {
        "labels": {
          "update": {
            "angle": {"value": -50},
            "fontSize": {"value": 10},
            "align": {"value": "right"}
          }
        }
      }
    },
    {
      "orient": "left",
      "scale": "y"
    }
  ],

  "marks": [
    {
      "type": "group",
      "from": {
        "facet": {
          "name": "series",
          "data": "table",
          "groupby": "c"
        }
      },
      "marks": [
        {
          "type": "line",
          "from": {"data": "series"},
          "encode": {
            "enter": {
              "x": {"scale": "x", "field": "x"},
              "y": {"scale": "y", "field": "y"},
              "stroke": {"scale": "color", "field": "c"},
              "strokeWidth": {"value": 2}
            },
            "update": {
              "interpolate": {"signal": "interpolate"},
              "strokeOpacity": {"value": 1}
            }
          }
        }
      ]
    }
  ]
}

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

client.on('message',(receivedMessage) => {
    if (receivedMessage.author == client.user) {
        return
    }
    let messageParts = receivedMessage.content.split(' ')
    if (receivedMessage.channel.id === '786343961798639687' && messageParts.length === 2 && messageParts[0] === '!radar') {
        receivedMessage.channel.startTyping()
        if (messageParts[1].length <= 2) {
            receivedMessage.channel.send(receivedMessage.author.toString() + ' Please use a search term of 3 letters or more!')
            receivedMessage.reactions.removeAll()
            return
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
                receivedMessage.channel.send('Gathering data for `'+idArray[ids[0]]+'`...')
                let text = process(ids[0],idArray[ids[0]],receivedMessage.channel)
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
                        msg += numbers[counter]+' '+idArray[element]+'\r'
                        filterable.push({
                            num: counter,
                            id: element,
                            name: idArray[element],
                            type: 'region'
                        })
                        counter++
                    });
                    msg += '```'
                }
                if (consts && consts.length > 0) {
                    msg += 'Constellations:```'
                    consts.forEach(element => {
                        msg += numbers[counter]+' '+idArray[element]+'\r'
                        filterable.push({
                            num: counter,
                            id: element,
                            name: idArray[element],
                            type: 'constellation'
                        })
                        counter++
                    });
                    msg += '```'
                }
                if (systems && systems.length > 0) {
                    msg += 'Systems:```'
                    systems.forEach(element => {
                        msg += numbers[counter]+' '+idArray[element]+'\r'
                        filterable.push({
                            num: counter,
                            id: element,
                            name: idArray[element],
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
                        return ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'].includes(reaction.emoji.name) && user.id === receivedMessage.author.id
                    }
                    response.awaitReactions(filter, {max: 1, time: 60000, errors: ['time']})
                        .then(collected => {
                            response.reactions.removeAll()
                            const reaction = collected.first()
                            let filterableNum = Object.keys(numbers).find(key => numbers[key] === reaction.emoji.name)
                            let result = filterable.find((value) => {
                                return value.num == filterableNum
                            })
                            receivedMessage.channel.send('Gathering data for `'+result.name+'`...')
                            let text = process(result.id,result.name,receivedMessage.channel)
                        })
                })
            }
        })
        receivedMessage.channel.stopTyping()
    }
})


function process(id, name, channel) {
  mongoClient.db('esidata').collection('npckills').findOne({system_id: id})
  .then((response) => {
    let data = defaultConfig
    let values = []
    Object.keys(response.data).forEach(key => {
      if (key === 'timestamp') {
        //Skip of old data
      } else {
        values.push({"x":transformDate(key),"y":response.data[key],"c":name})
      }
    })
    data.data =  [
      {
        "name": "table",
        "values": values
      }
    ]
    var view = new vega.View(vega.parse(data), {renderer: 'none'})
          .initialize()
          view.toCanvas().then((canvas) => {
              channel.send('',{
                  files: [
                      new canvasToBuffer(canvas).toBuffer()
                  ]
              })
          }).catch((err) => {console.log(err)})
  })
  .catch((error) => {
    console.log(error)
  })
}

function transformDate(dateString) {
  let result = dateString.match(/(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/)
  return result[1]+'-'+result[2]+'-'+result[3]+' '+result[4]+':'+result[5]
}

bot_secret_token = "Nzg2MzQyMjIwMTcyMjMwNjg2.X9FAQg.xzNodyOiHCAgnarAb3afsNADoPM"

client.login(bot_secret_token)