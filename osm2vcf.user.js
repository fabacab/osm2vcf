/**
 * This is a Greasemonkey(-compatible) script. It must be run from a
 * userscript manager such as Greasemonkey or Tampermonkey.
 */
// ==UserScript==
// @name        OSM2VCF
// @author      maymay <bitetheappleback@gmail.com>
// @description Download OSM node/way data as a vCard.
// @include     https://www.openstreetmap.org/node/*
// @include     https://www.openstreetmap.org/way/*
// @version     1.1.2
// @updateURL   https://github.com/meitar/osm2vcf/raw/master/osm2vcf.user.js
// @include     https://www.openstreetmap.org/relation/*
// @version     1.2.0
// @grant       GM.xmlHttpRequest
// ==/UserScript==

// Initialize.
CONFIG = {};

CONFIG.api_anchor = document.querySelector('[href^="/api"]');
CONFIG.api_url = CONFIG.api_anchor.getAttribute('href');

CONFIG.download_button = createDownloadLink();

CONFIG.vCard = {};
CONFIG.vCard.version = '3.0';

/**
 * Makes the "Download VCF" link in the OSM Web interface.
 *
 * @return HTMLElement
 */
function createDownloadLink () {
    var dl_btn = document.createElement('a');
    dl_btn.addEventListener('click', main);
    dl_btn.innerText = 'Download VCF';
    dl_btn.setAttribute('href', '#')
    dl_btn.setAttribute('download', window.location.pathname.match(/\d*$/))
    return dl_btn;
}

/**
 * Initialize the UI by creating a download link.
 */
function init () {
    CONFIG.api_anchor.insertAdjacentElement('afterend', CONFIG.download_button);
    CONFIG.api_anchor.insertAdjacentHTML('afterend', ' · ');
}

/** Put the content on the link */
function setContent(content) {
            var b = new Blob([
                vCardWriter(osm2vcf(content))
            ], { 'type': 'text/vcard' });
            CONFIG.download_button.setAttribute('href', URL.createObjectURL(b));
            window.location = CONFIG.download_button.getAttribute('href');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Set the output location to be roughly the middle of the locations of all the nodes */
async function addLocationFromNodes (elementWithNodes, responseStructure) {
  let minLat = 180.0;
  let maxLat = -180.0;
  let minLon = 180.0;
  let maxLon = -180.0;
	let count = 0.0;
	let allNodes = elementWithNodes.querySelectorAll('nd');
  for(var n = 0; n < allNodes.length; n++) {
    let nd = allNodes[n];
		let baseUrl = window.location.protocol + '//' + window.location.host +
                					CONFIG.api_url.substring(0, CONFIG.api_url.indexOf(CONFIG.api_url.match(/relation|way/)[0]));
		let ndUrl = baseUrl + 'node/' + nd.getAttribute('ref');
		GM.xmlHttpRequest({
			'method': 'GET',
			'synchronous': true,
			'url': ndUrl,
			'onload': function (wayResponse) {
        var ndDom = wayResponse.responseXML.documentElement;
        count += 1;
        if (ndDom.querySelector('node')) {
          var keys = ['lat', 'lon'];
          let lat = parseFloat(ndDom.querySelector('node').getAttribute('lat'));
          let lon = parseFloat(ndDom.querySelector('node').getAttribute('lon'));
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
        }
			}
		});
	}
  while (count < allNodes.length) {
    await sleep(100);
  }
	responseStructure['lat'] = ((minLat + maxLat) / 2).toFixed(7);
	responseStructure['lon'] = ((minLon + maxLon) / 2).toFixed(7);
	setContent(responseStructure);
}


/**
 * Receives the XMLHttpRequest response from the OSM API server.
 *
 * The body of this response should be an XML document in OSM style.
 *
 * @param {object} response
 * @return {object}
 */
function parseApiResponse (response) {
    var el = response.responseXML.documentElement;
    var keys = [
        'addr:city',
        'addr:place',
        'addr:housenumber',
        'addr:postcode',
        'addr:state',
        'addr:street',
        'description',
        'email',
        'name',
        'phone',
        'website',
    ];
    var r = {}
    for (var i = 0; i < keys.length; i++) {
        if (el.querySelector('tag[k="' + keys[i] + '"]')) {
            r[keys[i]] = el
                .querySelector('tag[k="' + keys[i] + '"]')
                .getAttribute('v');
        }
    }

    // Only OSM Nodes have individual lat/lon info.
    if (el.querySelector('node')) {
        var keys = ['lat', 'lon'];
        for (var i = 0; i < keys.length; i++) {
            r[keys[i]] = el.querySelector('node')
                .getAttribute(keys[i]);
        }
  	setContent(r);
    } else {
      	// If we have something with ways, pick the first way and set the location based on its centre
      	if (el.querySelector('member[type="way"]')) {
            let baseUrl = window.location.protocol + '//' + window.location.host +
                					CONFIG.api_url.substring(0,
                                       CONFIG.api_url.indexOf(CONFIG.api_url.match(/relation|way/)[0]));
            let wayUrl = baseUrl + 'way/' + el.querySelector('member[type="way"]').getAttribute('ref');
            GM.xmlHttpRequest({
			        'method': 'GET',
              'synchronous': true,
        			'url': wayUrl,
        			'onload': function (wayResponse) {
            		addLocationFromNodes(wayResponse.responseXML.documentElement, r);
			        }
    				});
        } else {
          // If we have something with nodes, set the location based on the centre of the nodes
         addLocationFromNodes(el, r);
        }
    }
}

/**
 * Convert OSM tags to VCF-formatted fields.
 *
 * @param {object} osm Object with OSM-formatted keys.
 * @return {object} Object with VCF-formatted keys.
 */
function osm2vcf (osm) {
    var vcf = {};
    vcf['KIND'] = 'org';

    keys = Object.keys(osm);

    addr = keys.filter(function (element) {
        return element.startsWith('addr:');
    });
    if (addr.length) {
        vcf['ADR'] = [
            '',
            osm['addr:housenumber'] || '',
            osm['addr:street'] || '',
            osm['addr:city'] || osm['addr:place'] || '',
            osm['addr:state'] || '',
            osm['addr:postcode'] || '',
            osm['addr:country'] || ''
        ].join(';');
    }

    if (osm.lat) {
        vcf['GEO'] = osm.lat + ',' + osm.lon;
    }
    if (osm.name) {
        vcf['ORG'] = osm.name;
    }
    if (osm.description) {
        vcf['NOTE'] = osm.description.replace(/\n/g, '\\n');
    }
    if (osm.email) {
        vcf['EMAIL'] = osm.email;
    }
    if (osm.phone) {
        vcf['TEL']   = osm.phone;
    }
    if (osm.website) {
        vcf['URI']   = osm.website;
    }
    return vcf;
}

/**
 * Write OSM data in VCF format.
 * 
 * @param {object} data
 * @return {string}
 */
function vCardWriter (data) {
    vcf_string = "BEGIN:VCARD";
    vcf_string += "\r\nVERSION:" + CONFIG.vCard.version;
    vcf_string += "\r\nPRODID:OSM2VCF Userscript";
    vcf_string += "\r\nREV:" + new Date().toISOString();

    if (data.KIND) {
        vcf_string += "\r\nKIND:" + data.KIND;
    }
    if (data.GEO) {
        vcf_string += "\r\nGEO:" + data.GEO;
    }
    if (data.ADR) {
        vcf_string += "\r\nADR:" + data.ADR;
    }
    if (data.FN) {
        vcf_string += "\r\nFN:" + data.FN;
    }
    if (data.TEL) {
        vcf_string += "\r\nTEL:" + data.TEL;
    }
    if (data.URI) {
        vcf_string += "\r\nURI:" + data.URI;
    }
    if (data.ORG) {
        vcf_string += "\r\nORG:" + data.ORG;
    }
    if (data.EMAIL) {
        vcf_string += "\r\nEMAIL:" + data.EMAIL;
    }
    if (data.NOTE) {
        vcf_string += "\r\nNOTE:" + data.NOTE;
    }

    vcf_string += "\r\nEND:VCARD";
    return vcf_string;
}

/**
 * Main entry point for the script.
 *
 * @param {MouseEvent} e
 */
function main (e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    GM.xmlHttpRequest({
        'method': 'GET',
        'synchronous': true,
        'url': window.location.protocol + '//' + window.location.host + CONFIG.api_url,
        'onload': function (response) {
          parseApiResponse(response);
        }
    });
}

init();