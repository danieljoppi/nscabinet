/* eslint-env node:false */
/* eslint no-unused-vars: 0*/

function log() {

    var txt = [];
    for ( var it in arguments ) {
        txt.push(arguments[it]);
    }
    nlapiLogExecution('DEBUG','log',JSON.stringify(txt));

}

var post = function (datain) {

    'use strict';

    //ROUTER

    log(datain);

    switch(datain.action) {
    case 'download':
        return download(datain);
    case 'upload':
        return upload(datain);
    }

};

var upload = function(datain) {

    var body = nlapiDecrypt(datain.content, 'base64');

    if (!datain.filepath) throw nlapiCreateError('PARAM_ERR','No file path specified', true);
    if (!datain.rootpath) throw nlapiCreateError('PARAM_ERR','No destination root path specified', true);

    var info = pathInfo(datain.filepath, datain.rootpath,true);

    if (info.filename) {
        var file = nlapiCreateFile(info.filename, info.nsfileext, body);
        file.setFolder(info.folderid);
        var r = JSON.stringify(nlapiSubmitFile(file));
        nlapiLogExecution('ERROR', 'up!', r);
        return {message: 'Uploaded ' + info.filename + ' to file id ' + r , fileid: Number(r)};
    }

};

var download = function(datain) {

    if (!(datain.files instanceof Array)) datain.files = [datain.files];

    function getFileData(file,info) {

        var contents = file.getValue();

        if ( ~NON_BINARY_FILETYPES.indexOf(file.getType()) )
            contents = nlapiEncrypt(contents,'base64');

        return {
            path : info.baserelative + file.getName(),
            contents : contents
        };

    }

    var outfiles = [];

    datain.files.forEach( function(glob){

        var info = pathInfo(glob, datain.rootpath);

        //found out nlapiSearchRecord('file') filtered by folder returns a recursive search,
        //which turns out to be nasty for performance.
        //so, split in 2 cases. If the path seems to be absolute, load directly. If not, execute the search.
        if( /\*|\%/g.test(glob) ) {

            var filter = [
                [ 'name' , 'contains' , info.filename.replace(/\*/g,'%') ] , 'and' ,
                [ 'folder' , 'anyof' , info.folderid ]
            ];

            log(filter);

            var columns =
                ['name','filetype','folder'].map( function(i){return new nlobjSearchColumn(i);});

            var addFiles =
                (nlapiSearchRecord('file', null , filter , columns ) || [])
                    .filter( function(resFile) {

                        return resFile.getValue('folder') == info.folderid;

                    })
                    .map( function(resFile) {

                        var file = nlapiLoadFile(resFile.getId());
                        return getFileData(file,info);

                    });

            outfiles = outfiles.concat(addFiles);

        //case 2: direct load
        } else {

            var file = nlapiLoadFile(info.pathabsolute.substr(1));
            outfiles = outfiles.concat([getFileData(file,info)]);

        }

    });

    return {
        files : outfiles
    };

};



var NON_BINARY_FILETYPES = [
    'CSV' , 'HTMLDOC' , 'JAVASCRIPT' , 'MESSAGERFC' , 'PLAINTEXT'
    , 'POSTSCRIPT' , 'RTF' , 'SMS' , 'STYLESHEET' , 'XMLDOC'
];

var EXT_TYPES = {
    dwg: 'AUTOCAD',
    bmp: 'BMPIMAGE',
    csv: 'CSV',
    xls: 'EXCEL',
    swf: 'FLASH',
    gif: 'GIFIMAGE',
    gz: 'GZIP',
    htm: 'HTMLDOC',
    ico: 'ICON',
    js: 'JAVASCRIPT',
    jpg: 'JPGIMAGE',
    eml: 'MESSAGERFC',
    mp3: 'MP3',
    mpg: 'MPEGMOVIE',
    mpp: 'MSPROJECT',
    pdf: 'PDF',
    pjpeg: 'PJPGIMAGE',
    txt: 'PLAINTEXT',
    png: 'PNGIMAGE',
    ps: 'POSTSCRIPT',
    ppt: 'POWERPOINT',
    mov: 'QUICKTIME',
    rtf: 'RTF',
    sms: 'SMS',
    css: 'STYLESHEET',
    tiff: 'TIFFIMAGE',
    vsd: 'VISIO',
    doc: 'WORD',
    xml: 'XMLDOC',
    zip: 'ZIP'
};


function pathInfo( pathIn, basePath , createFolders) {

    'use strict';

    var absolute;
    var abspath;
    if (pathIn.charAt(0) != '/') {
        absolute = false;
        abspath = basePath + '/' + pathIn;
    } else {
        abspath = pathIn;
    }

    //windows fix
    var fname = abspath.replace(/[\\]/g, '/');
    var fname_split = fname.split('/');
    var folderId = null;
    var pathOnly = '';

    var len = fname_split.length - 1;
    for (var it = 0; it < len; it++) {
        var item = fname_split[it];
        if (it < len - 1) pathOnly += item;
        if (!item) continue;
        var res_folder = nlapiSearchRecord('folder', null,
            [['name', 'is', item], 'and', ['parent', 'anyof', folderId || '@NONE@']]
        );
        if (!res_folder && !createFolders) throw nlapiCreateError('FOLDER_NOT_FOUND', 'Folder ' + item + ' not found!', true);
        else if (!res_folder && createFolders) {
            var newFolderRec = nlapiCreateRecord('folder');
            newFolderRec.setFieldValue('name', item);
            newFolderRec.setFieldValue('parent', folderId);
            folderId = nlapiSubmitRecord(newFolderRec);
        } else {
            folderId = res_folder[0].getId();
        }
    }

    var out = {};
    out.folderid = folderId;
    out.filename = fname_split[fname_split.length - 1];
    out.fileext = out.filename.substr(out.filename.lastIndexOf('.') + 1);
    out.nsfileext = EXT_TYPES[out.fileext] || 'PLAINTEXT';
    out.pathabsolute = abspath;
    out.pathrelative = absolute ? abspath : abspath.substr(basePath.length + 1);
    out.baserelative = out.pathrelative.substr(0,out.pathrelative.length-out.filename.length);

    return out;

}