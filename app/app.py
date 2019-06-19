#!/usr/bin/env python3

import os
from wsgiref.simple_server import make_server
import falcon
import requests

GIPHY_API_KEY = os.getenv('GIPHY_API_KEY', '?')
GIT_COMMIT = os.getenv('GIT_COMMIT', '?')
GIT_BRANCH = os.getenv('GIT_BRANCH', '?')

def get_dad_joke():
    r = requests.get('https://icanhazdadjoke.com/', headers={'Accept': 'application/json'})
    data = r.json()
    return data['joke']

def get_image():
    r = requests.get('https://api.giphy.com/v1/gifs/random?api_key='+GIPHY_API_KEY+'&tag=sigh', headers={'Accept': 'application/json'})
    data = r.json()
    return data['data']['images']['original']['url']

def meme_page_html(text, image):
    return '''
<html>
    <head>
        <!-- test -->
        <title>MemeLordz.Net</title>
        <meta name="viewport" content="width=device-width">
        <meta name="description" content="Your home for wacky memes">
    </head>
    <body style="text-align:center; background: -webkit-gradient(linear, left top, left bottom, from(#ff8f2e), to(#ffb498)) fixed; background: -webkit-gradient(linear, left top, left bottom, from(#2e82ff), to(#ffb498)) fixed;">
        <br>
        <pre style="font-weight: bold;">
       ___        ___       __   __   __  __ 
 |\/| |__   |\/| |__  |    /  \ |__) |  \  / 
 |  | |___  |  | |___ |___ \__/ |  \ |__/ /_ 
                                             
        </pre>
        <div style="max-width: 90%; width: 600px; background-color: black; margin: 0 auto; padding: 5px; border-radius: 16px; box-shadow: -1px 0px 11px 5px #b13303db;">
            <h2 style="color: white">'''+text+'''</h2>
            <img style="width: 95%" src="'''+image+'''"/>
            <br>
        \</div>
    </body>
</html>
     '''

class MemeLordz:
    def on_get(self, req, resp):
        text = get_dad_joke()
        image = get_image()
        html = meme_page_html(text, image)
        resp.content_type = 'text/html; charset=utf-8'
        resp.body = html

class Version:
    def on_get(self, req, resp):
        resp.content_type = 'text/html; charset=utf-8'
        resp.body = '<h2>Commit: '+GIT_COMMIT+'</h2><br><h2>Branch: '+GIT_BRANCH+'</h2>'

app = falcon.API()
app.add_route('/', MemeLordz())
app.add_route('/version', Version())

if __name__ == '__main__':
    with make_server('', 8080, app) as httpd:
        print('Serving on port 8080...')
        httpd.serve_forever()