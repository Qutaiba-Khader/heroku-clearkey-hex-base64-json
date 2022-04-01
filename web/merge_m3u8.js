let
    _ = require('lodash'),
    kefir = require('kefir'),
    request = require('request'),
    url = require('url'),
    express = require('express');

let videoSourcesProperty = kefir
    .combine([
        "https://player.vimeo.com/external/217157675.m3u8?s=4a0c6e0d89f1d443259dc8848866a8b7262ac31e",
        "https://player.vimeo.com/external/217157707.m3u8?s=ca8c6c0871c11e9e146d15045301fe52b35a8075",
        "https://player.vimeo.com/external/217157746.m3u8?s=ef4b7c67cdfd8cdcbe51a78c33625c1e46834d02",
        "https://player.vimeo.com/external/217157625.m3u8?s=f584d4694f08a9af63324ddea22e618d8a5d5b75"
    ].map((entryFile)=> {
        return kefir
            .fromNodeCallback((cb)=> request({ method: "GET", url: entryFile }, _.rearg(cb, [0, 2])))
            .map((streamInfo)=> _.last(streamInfo.match(/^\#EXT-X-STREAM-INF.*\n(.*$)/m)))
            .flatMap((indexUrl)=> {
                return kefir
                    .fromNodeCallback((cb)=> request({ method: "GET", url: indexUrl }, _.rearg(cb, [0, 2])))
                    .map((indexInfo)=> {
                        let files = [];
                        for(let fileRegExp = /^#EXTINF:([0-9.]*).*\n^(.*)$/gm, curMatch; curMatch = fileRegExp.exec(indexInfo);){
                            let [, duration, file] = curMatch;
                            files.push({ file: url.resolve(indexUrl, file), duration: Number(duration) });
                        }
                        return files;
                    });
            });
    }))
    .map(_.flatten)
    .toProperty();

let app = express();

kefir.combine([
    kefir.stream(({ emit })=> app.get('/', (req, res)=> emit(res))),
    videoSourcesProperty.map((files)=>[
        "#EXTM3U",
        "#EXT-X-TARGETDURATION:10",
        "#EXT-X-VERSION:3",
        "#EXT-X-MEDIA-SEQUENCE:1",
        ...files.map(({ file, duration })=>[`#EXTINF:${duration.toFixed(2)},`, file].join('\n')),
        "#EXT-X-ENDLIST"
    ].join('\n'))
]).onValue(([res, manifest])=>{
    res
        .contentType('application/vnd.apple.mpegurl')
        .status(200)
        .end(manifest);
});

app.listen(8080);