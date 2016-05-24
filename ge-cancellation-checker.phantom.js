
// CLI usage:
// phantomjs [--ssl-protocol=any] ge-cancellation-checker.phantom.js [-v|--verbose]

var system = require('system');
var fs = require('fs');

var VERBOSE = false;
var loadInProgress = false;

// Calculate path of this file
var PWD = '';
var current_path_arr = system.args[0].split('/');
if (current_path_arr.length == 1) { PWD = '.'; }
else {
    current_path_arr.pop();
    PWD = current_path_arr.join('/');
}

// Gather Settings...
var settings = 'Not set'
try {
    settings = JSON.parse(fs.read(PWD + '/config.json'));
    if (!settings.username || !settings.username || !settings.init_url || !settings.enrollment_location_id) {
        console.log('Missing username, password, enrollment location ID, and/or initial URL. Exiting...');
        phantom.exit();
    }
}
catch(e) {
    console.log('Could not find config.json');
    phantom.exit();
}

// ...from command
system.args.forEach(function(val, i) {
    if (val == '-v' || val == '--verbose') { VERBOSE = true; }
});

function fireClick(el) {
    var ev = document.createEvent("MouseEvents");
    ev.initEvent("click", true, true);
    el.dispatchEvent(ev);
}

var page = require('webpage').create();

page.onConsoleMessage = function(msg) {
    if (!VERBOSE) { return; }
    console.log(msg);
};

page.onError = function(msg, trace) {
    if (!VERBOSE) { return; }
    console.error('Error on page: ' + msg);
    var msgStack = ['PHANTOM ERROR: ' + msg];
      if (trace && trace.length) {
        msgStack.push('TRACE:');
        trace.forEach(function(t) {
          msgStack.push(' -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function ' + t.function +')' : ''));
        });
      }
    console.error(msgStack.join('\n'));
}

page.onCallback = function(query, msg) {
    if (query == 'username') { return settings.username; }
    if (query == 'password') { return settings.password; }
    if (query == 'fireClick') {
        return function() { return fireClick; } // @todo:david DON'T KNOW WHY THIS DOESN'T WORK! :( Just returns [Object object])
    }
    if (query == 'report-interview-time') {
        if (VERBOSE) { console.log('Next available appointment is at: ' + msg); }
        else { console.log(msg); }
        return;
    }
    if (query == 'fatal-error') {
        console.log('Fatal error: ' + msg);
        phantom.exit();
    }
    return null;
}

page.onLoadStarted = function() { loadInProgress = true; };
page.onLoadFinished = function() { loadInProgress = false; };

if (VERBOSE) { console.log('Please wait...'); }

page.open(settings.init_url);
var steps = [
    function() { // Log in
        page.evaluate(function() {
            console.log('On GOES login page...');
            document.querySelector('input[name=username]').value = window.callPhantom('username');
            document.querySelector('input[name=password]').value = window.callPhantom('password');
            document.querySelector('form[action="/pkmslogin.form"]').submit();
            console.log('Logging in...');
        });
    },
    function() { // Accept terms
        page.open(settings.init_url + '/HomePagePreAction.do');
        // page.evaluate(function() {

        //     function fireClick(el) {
        //         var ev = document.createEvent("MouseEvents");
        //         ev.initEvent("click", true, true);
        //         console.log('--- CLICKING Button: ' + el);
        //         el.dispatchEvent(ev);
        //     }

        //     var $acceptTermsBtn = document.querySelector('a[href="/main/goes/HomePagePreAction.do"]');

        //     if (!$acceptTermsBtn) {
        //         return window.callPhantom('fatal-error', 'Unable to find terms acceptance button');
        //     }

        //     fireClick($acceptTermsBtn);
        //     console.log('Accepting terms...');
        // });
    },
    function() { // main dashboard
        page.evaluate(function() {

            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }
            var $manageAptBtn = document.querySelector('.bluebutton[name=manageAptm]');
            if (!$manageAptBtn) {
                return window.callPhantom('fatal-error', 'Unable to find Manage Appointment button');
            }
            console.log(document);
            fireClick($manageAptBtn);
            console.log('Entering appointment management...');
        });
    },
    function() {
        page.evaluate(function() {

            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }

            var $rescheduleBtn = document.querySelector('input[name=reschedule]');

            if (!$rescheduleBtn) {
                return window.callPhantom('fatal-error', 'Unable to find reschedule button. Is it after or less than 24 hrs before your appointment?');
            }

            fireClick($rescheduleBtn);
            console.log('Entering rescheduling selection page...');
        });
    },
    function() {
        page.evaluate(function(location_id) {

            function fireClick(el) {
                var ev = document.createEvent("MouseEvents");
                ev.initEvent("click", true, true);
                el.dispatchEvent(ev);
            }

            document.querySelector('select[name=selectedEnrollmentCenter]').value = location_id;
            fireClick(document.querySelector('input[name=next]'));
            console.log('Choosing SFO...');
        }, settings.enrollment_location_id.toString());
    },
    function() {
        page.evaluate(function() {

            // We made it! Now we have to scrape the page for the earliest available date

            var date = document.querySelector('.date table tr:first-child td:first-child').innerHTML;
            var month_year = document.querySelector('.date table tr:last-child td:last-child div').innerHTML;

            var full_date = month_year.replace(',', ' ' + date + ',');
            // console.log('');
            window.callPhantom('report-interview-time', full_date)
            // console.log('The next available appointment is on ' + full_date + '.');
        });
    }
];

var i = 0;
interval = setInterval(function() {
    if (loadInProgress) { return; } // not ready yet...
    if (typeof steps[i] != "function") {
        return phantom.exit();
    }

    steps[i]();
    i++;

}, 100);
