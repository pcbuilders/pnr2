var fs        = require('fs');
var util      = require('util');
var request   = require('request');
var minimist  = require('minimist');

var args = minimist(process.argv.slice(2), {
  string: 'id',
  string: 'name',
  '--': true
});

var id                      = args.id,
    fname                   = args.name,
    fpath                   = ['/var/dataku', process.env.WNUM, fname].join('/'),
    apiLogUrl               = process.env.API_URL,
    apiUploadUrl            = process.env.API_UPLOAD_URL,
    secrets                 = JSON.parse(fs.readFileSync('secrets.json', 'utf8')),
    userAgent               = "Mozilla/5.0 (Windows NT 10.0; rv:44.0) Gecko/20100101 Firefox/44.0";

var effectiveId             = secrets.effective_id,
    cookie                  = secrets.gphoto_cookie;

function postHeaders() {
  return {
    "Host": "photos.google.com",
    "User-Agent": userAgent,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Referer": "https://photos.google.com",
    "Cookie": (cookie).toString(),
    "Connection": "keep-alive"
  }
}

function postHeadersInit() {
  return util._extend(postHeaders(), {
    "X-GUploader-Client-Info": 'mechanism=scotty xhr resumable; clientVersion=131213166',
    "Content-Type"           : "application/x-www-form-urlencoded;charset=utf-8"
  });
}

function postHeadersUpload() {
  return util._extend(postHeaders(), {
    "X-HTTP-Method-Override": "PUT",
    "X-GUploader-No-308": "yes",
  });
}

function postData(size) {
  return {
    "protocolVersion": "0.8",
    "createSessionRequest": {
      "fields": [
        {
          "external": {
            "name": "file",
            "filename": (fname).toString(),
            "put": {
            },
            "size": parseInt(size)
          }
        },
        {
          "inlined": {
            "name": "auto_create_album",
            "content": "camera_sync.active",
            "contentType": "text/plain"
          }
        },
        {
          "inlined": {
            "name": "auto_downsize",
            "content": "true",
            "contentType": "text/plain"
          }
        },
        {
          "inlined": {
            "name": "storage_policy",
            "content": "use_manual_setting",
            "contentType": "text/plain"
          }
        },
        {
          "inlined": {
            "name": "disable_asbe_notification",
            "content": "true",
            "contentType": "text/plain"
          }
        },
        {
          "inlined": {
            "name": "client",
            "content": "photosweb",
            "contentType": "text/plain"
          }
        },
        {
          "inlined": {
            "name": "effective_id",
            "content": (effectiveId).toString(),
            "contentType": "text/plain"
          }
        },
        {
          "inlined": {
            "name": "owner_name",
            "content": (effectiveId).toString(),
            "contentType": "text/plain"
          }
        },
        {
          "inlined": {
            "name": "timestamp_ms",
            "content": (Date.now()).toString(),
            "contentType": "text/plain"
          }
        }
      ]
    }
  }
}

function genUploadUrl(size, callback) {
  request.post({
    url: apiUploadUrl,
    headers: postHeadersInit(),
    body: JSON.stringify(postData(size))
  }, function(err, resp, body) {
    if (err || resp.statusCode !== 200) {
      callback(err || resp.statusCode, null);
      return;
    } else {
      var uploadUrl = JSON.parse(body).sessionStatus.externalFieldTransfers[0].putInfo.url;
      if (uploadUrl) {
        uploadFile(uploadUrl, function(e, s) {
          callback(e, s);
          return;
        });
      } else {
        callback('Response not containing valid upload url', null);
        return;
      }
    }
  });
}

function uploadFile(uploadUrl, callback) {
  request.post({
    url: uploadUrl,
    headers: postHeadersUpload(),
    body: fs.createReadStream(fpath)
  }, function(err, resp, body) {
    if (err || resp.statusCode !== 200) {
      callback(err || resp.statusCode, null);
      return;
    } else {
      var parsedResponse = JSON.parse(body);
      if (parsedResponse.errorMessage) {
        callback('Failed uploading file: ' + body, null);
        return;
      } else {
        callback(null, body);
        return;
      }
    }
  });
}

function logHttp(item, callback) {
  request.post({
    url: apiLogUrl,
    qs: {
      do: item.status,
      id: id
    },
    form: {
      comment: item.comment
    }
  }, function(e, r, b) {
    if (e || r.statusCode !== 200) {
      callback(e || r.statusCode, null);
      return;
    } else {
      callback(null, b);
      return;
    }
  });
}

fs.stat(fpath, function(err, file) {
  if (err) {
    logHttp({comment: JSON.stringify({msg: 'Failed uploading file', body: 'File not found'}), status: 'error'});
  } else {
    genUploadUrl(file.size, function(e, s) {
      if (e) {
        logHttp({comment: JSON.stringify({msg: 'Failed uploading file', body: e}), status: 'error'});
      } else {
        logHttp({comment: s, status: 'uploaded'}, function(e2, s2) {
          if (e2) {
            logHttp({comment: '', status: 'completed'});
          } else {
            fs.unlink(fpath);
          }
        });
      }
    });
  }
});
