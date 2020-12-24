const fs = require('fs')
function gatherIdData(swagger) {
    let idArray = {}
    console.log('[System data cache]Preparing system data cache, please wait...')
    Promise.all([
        swagger.apis.Universe.get_universe_systems(),
        swagger.apis.Universe.get_universe_constellations(),
        swagger.apis.Universe.get_universe_regions()
    ]).then((response) => {
        let ids = response[0].body.concat(response[1].body).concat(response[2].body)
        console.log('[System data cache]Found ' + ids.length + ' ids to lookup...')
        var i, j, k = 1, temparray, chunk = 1000
        var l = Math.ceil(ids.length / chunk)
        for (i = 0, j = ids.length; i < j; i += chunk) {
            temparray = ids.slice(i, i + chunk)
            swagger.apis.Universe.post_universe_names({
                ids: temparray
            }).then((response) => {
                response.body.forEach(element => {
                    idArray[element.id] = {
                        'name': element.name,
                        'type': element.category
                    }
                });
                console.log('[System data cache]Partial pull #' + k + '/' + l + ' done!')
                if (k === l) {
                    console.log('[System data cache]All partical pulls complete, system cache has been built!')
                }
                k++
            })
        }
    })
    return idArray
}

module.exports = {
    gatherIdData
}