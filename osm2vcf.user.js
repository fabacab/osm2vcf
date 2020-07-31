/**
 * This is a Greasemonkey(-compatible) script. It must be run from a
 * userscript manager such as Greasemonkey or Tampermonkey.
 */
// ==UserScript==
// @name        OSM2VCF
// @description Download OSM node/way data as a vCard.
// @include     https://www.openstreetmap.org/node/*
// @include     https://www.openstreetmap.org/relation/*
// @include     https://www.openstreetmap.org/way/*
// @version     1.2.0
// @updateURL   https://github.com/meitar/osm2vcf/raw/master/osm2vcf.user.js
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

/**
 * Receives the XMLHttpRequest response from the OSM API server.
 *
 * The body of this response should be an XML document in OSM style.
 *
 * @param {object} response
 * @return {object}
 */
function parseApiResponse (response) {
    var m  = response.finalUrl.match(/(node|way|relation)\/(\d+)(?:\/full)?/);
    if (null === m) { throw 'Unrecognized API call.'; }

    var id = m[2]; // OSM object ID.
    var oe = m[1]; // OSM element type.

    var r  = {};   // Return object.
    var d  = response.responseXML.documentElement;
    var el = d.querySelector(oe + '[id="'+ id +'"]');

    // Find meaningful tags associated with the requested object.
    var keys = [
        'addr:city',
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
    for (var i = 0; i < keys.length; i++) {
        if (el.querySelector('tag[k="' + keys[i] + '"]')) {
            r[keys[i]] = el
                .querySelector('tag[k="' + keys[i] + '"]')
                .getAttribute('v');
        }
    }

    // Collect all the Nodes so we can deduce location/position.
    r['x-osm-member-nodes'] = Array.from(d.querySelectorAll('node'));

    // If the requested object explicitly labels its geographic center
    // then we can forget about the other Nodes and just note that one.
    var explicit_center = el.querySelector(
        'member[type="node"][role="admin_centre"], member[type="node"][role="label"]'
    );
    if (explicit_center) {
        r['x-osm-member-nodes'] = [d.querySelector(
            '[id="' + explicit_center.getAttribute('ref') + '"]'
        )];
    }

    return r;
}

/**
 * Ensures lat/lon keys are included in the OSM object.
 *
 * OSM Node elements are the only OSM element that can be directly
 * associated with geographic coordinates, but many meaningful OSM
 * objects are represented as Ways or Relations. These objects have
 * one or more member nodes, and this function ensures the passed
 * object has a generally sensible geographic coordinate attached.
 *
 * @param {object} osm Object with OSM-formatted keys.
 * @return {object} OSM-formatted object with guaranteed lat/lon.
 */
function normalizeGeographicCenter (osm) {
    var points = osm['x-osm-member-nodes'].map(function (el) {
        return {
            'lat': el.getAttribute('lat'),
            'lon': el.getAttribute('lon')
        };
    });

    var min_lat = Math.min(...points.map(function (p) {
        return p.lat;
    }));
    var max_lat = Math.max(...points.map(function (p) {
        return p.lat;
    }));
    var min_lon = Math.min(...points.map(function (p) {
        return p.lon;
    }));
    var max_lon = Math.max(...points.map(function (p) {
        return p.lon;
    }));

    osm.lat = ((min_lat + max_lat) / 2).toFixed(7);
    osm.lon = ((min_lon + max_lon) / 2).toFixed(7);

    return osm;
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
            osm['addr:city'] || '',
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

    // Use the `/full` endpoint for an OSM Way or Relation.
    // OSM Nodes don't have this endpoint, will return HTTP 404.
    var url = window.location.protocol + '//' + window.location.host + CONFIG.api_url
    if (-1 === CONFIG.api_url.indexOf('/node/')) {
         url += '/full';
    }

    GM.xmlHttpRequest({
        'method': 'GET',
        'synchronous': true,
        'url': url,
        'onload': function (response) {
            var b = new Blob([
                vCardWriter(
                    osm2vcf(
                        normalizeGeographicCenter(
                            parseApiResponse(response)
                        )
                    )
                )
            ], { 'type': 'text/vcard' });
            CONFIG.download_button.setAttribute('href', URL.createObjectURL(b));
            window.location = CONFIG.download_button.getAttribute('href');
        }
    });
}

init();
