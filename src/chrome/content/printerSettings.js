/*
  PrintingTools NG is a derivative extension for Thunderbird 68+
  providing printing tools for messages.
  The derivative extension authors:
    Copyright (C) 2023 : Christopher Leidigh

  The original extension & derivatives, PrintingTools, by Paolo "Kaosmos",
  is covered by the GPLv3 open-source license (see LICENSE file).
    Copyright (C) 2007 : Paolo "Kaosmos"

  PrintingTools NG is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


/* globals
Services,
printingtools,
IOUtils,
PathUtils,
st,

*/

var { Services } = ChromeUtils.import('resource://gre/modules/Services.jsm');

var window3Pane = Cc["@mozilla.org/appshell/window-mediator;1"]
  .getService(Ci.nsIWindowMediator)
  .getMostRecentWindow("mail:3pane");

var window;
var document;

var locale = Services.locale.appLocaleAsBCP47;

var prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
var PSSVC = Cc["@mozilla.org/gfx/printsettings-service;1"]
  .getService(Ci.nsIPrintSettingsService);

var EXPORTED_SYMBOLS = ["printerSettings"];

// These are our default settings for those we control separate from main prefs
var printerSettings = {
  defaultPTNGprinterSettings: {
    scaling: 1,
    pageRanges: [],
    marginTop: 0.5,
    marginBottom: 0.5,
    marginLeft: 0.5,
    marginRight: 0.5,
    headerStrLeft: "",
    headerStrCenter: "&T",
    headerStrRight: "",
    footerStrLeft: "&PT",
    footerStrCenter: "",
    footerStrRight: "&D",
  },

  getPrinterSettings: function (window, outputPrinter) {
    var document = window.document;
    var printSettings;
    if (PSSVC.newPrintSettings) {
      printSettings = PSSVC.newPrintSettings;
    } else {
      printSettings = PSSVC.createNewPrintSettings();
    }

    printSettings.printerName = outputPrinter;
    PSSVC.initPrintSettingsFromPrefs(printSettings, true, printSettings.kInitSaveAll);
    printSettings.isInitializedFromPrinter = true;

    document = window.document;
    console.log("get print settings ", document);
    console.log("printer Settings on entry\n ", printSettings)
    let printerName = printSettings.printerName;
    let printerNameEsc = printerName.replace(/ /g, '_');
    let p = `extensions.printingtoolsng.printer.${printerNameEsc}`;

    let t = prefs.getPrefType(p);

    var props;
    var customProps;
    console.log("get ptng ", printerName, t)
    // Check if we need to initialize PTNG printer settings
    if (t > 0) {
      printSettings = this.setPrinterSettingsFromPTNGsettings(printSettings);
    } else {
      console.log("init ptng ", printerName)
      this.initCustomPrinterOptions(printerName);
      printSettings = this.setPrinterSettingsFromPTNGsettings(printSettings);
    }

    //console.log(printSettings.paperSizeUnit);
    // 0=in, 1=mm

    console.log("getting prefs")
    console.log("printer ", printSettings.printerName)
    console.log("page units ", printSettings.paperSizeUnit)
    console.log("margin top ", printSettings.marginTop)
    console.log("margin bottom ", printSettings.marginBottom)
    console.log("margin left ", printSettings.marginLeft)
    console.log("margin right ", printSettings.marginRight)

    let paperSizeUnit = printSettings.paperSizeUnit;
    let localeUnits = (locale == "en-US") ? 0 : 1;
    let un = document.querySelector("#units");
    let unitsStr = ["(in)", "(mm)"];
    un.value = unitsStr[localeUnits];

    let prRG = document.querySelector("#pageRangesRG");
    let cr = document.querySelector("#pages");
    let pr = printSettings.pageRanges;

    if (pr.length == 0) {
      prRG.selectedIndex = 0;
      cr.setAttribute("disabled", "true");
      cr.value = "1";
    } else {
      prRG.selectedIndex = 1;
      cr.removeAttribute("disabled");
      cr.value = this.pageRangesToString(pr);
    }

    // disable copies for PDF printers
    let nc = document.querySelector("#copies-count");
    nc.value = printSettings.scaling * 100;
    if (printerName.toLowerCase().includes("pdf")) {
      // nc.setAttribute("disabled", "");
    } else {
      // nc.removeAttribute("disabled");
    }

    // Round all margins to two decimal places
    let el = document.querySelector("#margin-top");
    let n = this.inchesToLocaleUnits(printSettings.marginTop, localeUnits).toFixed(2);
    el.value =  new Intl.NumberFormat(locale).format(n);

    el = document.querySelector("#margin-bottom");
    n = this.inchesToLocaleUnits(printSettings.marginBottom, localeUnits).toFixed(2);
    el.value =  new Intl.NumberFormat(locale).format(n);

    el = document.querySelector("#margin-left");
    n = this.inchesToLocaleUnits(printSettings.marginLeft, localeUnits).toFixed(2);
    el.value =  new Intl.NumberFormat(locale).format(n);

    el = document.querySelector("#margin-right");
    n = this.inchesToLocaleUnits(printSettings.marginRight, localeUnits).toFixed(2);
    el.value =  new Intl.NumberFormat(locale).format(n);

    el = document.querySelector("#headerleft");
    el.value = printSettings.headerStrLeft;
    el = document.querySelector("#headercenter");
    el.value = printSettings.headerStrCenter;
    el = document.querySelector("#headerright");
    el.value = printSettings.headerStrRight;

    el = document.querySelector("#footerleft");
    el.value = printSettings.footerStrLeft;
    el = document.querySelector("#footercenter");
    el.value = printSettings.footerStrCenter;
    el = document.querySelector("#footerright");
    el.value = printSettings.footerStrRight;

    // Use the leftheader cell to determine table right edge
    // we must reset our input widths so our calculations start
    // with the base tablesize if we change printers

    document.querySelector("#headerleft").style.width = "";
    document.querySelector("#headercenter").style.width = "";
    document.querySelector("#headerright").style.width = "";
    document.querySelector("#footerleft").style.width = "";
    document.querySelector("#footercenter").style.width = "";
    document.querySelector("#footerright").style.width = "";

    // then we calc needed input to fill width
    el = document.querySelector("#leftHeaderTD");
    let frfc_cs = window.getComputedStyle(el);
    let frfc_width = frfc_cs.getPropertyValue("width");
    let w = Number(frfc_width.split("px")[0]) + 4;
    let ws = w + "px";
    // set all hdr ftr inputs to edge of table
    document.querySelector("#headerleft").style.width = ws;
    document.querySelector("#headercenter").style.width = ws;
    document.querySelector("#headerright").style.width = ws;
    document.querySelector("#footerleft").style.width = ws;
    document.querySelector("#footercenter").style.width = ws;
    document.querySelector("#footerright").style.width = ws;
  },

  pageRangesToString: function (pageRanges) {
    var pageRangesStr = "";

    if (pageRanges.length == 0) {
      return [];
    }
    let totalRangeItems = pageRanges.length;
    for (let pair = 0; pair < totalRangeItems - 1; pair += 2) {
      let startRange = pageRanges[pair];
      let endRange = pageRanges[pair + 1];
      // console.log(startRange + " - " + endRange);
      if (startRange == endRange) {
        pageRangesStr += startRange;
      } else {
        pageRangesStr += (startRange + "-" + endRange);
      }
      if (pair < totalRangeItems - 2) {
        pageRangesStr += ", ";
      }
    }
    return pageRangesStr;
  },


  setPageRangesFromString: function (pageRangesStr) {
    var pageRanges = [];

    if (pageRangesStr == "") {
      return pageRanges;
    }
    let ranges = pageRangesStr.split(",");

    for (let range of ranges) {
      let rangeParts = range.split("-");
      let startRange = parseInt(rangeParts[0], 10);
      let endRange = parseInt(
        rangeParts.length == 2 ? rangeParts[1] : rangeParts[0],
        10
      );

      if (isNaN(startRange) && isNaN(endRange)) {
        continue;
      }
      // If the startRange was not specified, then we infer this
      // to be 1.
      if (isNaN(startRange) && rangeParts[0] == "") {
        startRange = 1;
      }
      // If the end range was not specified, then we infer this
      // to be the total number of pages.
      if (isNaN(endRange) && rangeParts[1] == "") {
        endRange = 1000;
      }

      if (endRange < startRange) {
        continue;
      }

      if (startRange == 0 || endRange == 0) {
        continue;
      }
      pageRanges.push(startRange);
      pageRanges.push(endRange);
    }

    return pageRanges;
  },

  toInchValue: function (val) {
    if (typeof val == "string") {
      val = parseFloat(val);
    }
    return val * 1;
  },

  inchesToPaperUnits: function (val, units) {
    if (units == 0) {
      return val;
    }
    return val * 25.4;
  },

  localeUnitsToInches: function (localeVal, localeUnits) {
    // let localeUnits = (locale == "en-US") ? 0 : 1;

    // locale uses mm
    if (localeUnits) {
      return localeVal / 25.4;
    }
    return localeVal;
    
  },

  inchesToLocaleUnits: function (localeVal, localeUnits) {
    // let localeUnits = (locale == "en-US") ? 0 : 1;

    // locale uses mm
    if (localeUnits) {
      return localeVal * 25.4;
    }
    return localeVal;
    
  },
  paperToLocaleUnits: function (paperVal, paperSizeUnit) {
    let localeUnits = (locale == "en-US") ? 0 : 1;

    // locale uses mm
    if (localeUnits == paperSizeUnit) {
      return paperVal;
    }
    // convert to mm
    if (localeUnits) {
      return paperVal * 25.4;
    }
    // convert to inches
    return paperVal / 25.4;
  },

  localeToPaperUnits: function (localeVal, paperSizeUnit) {
    let localeUnits = (locale == "en-US") ? 0 : 1;

    // locale uses mm
    if (localeUnits == paperSizeUnit) {
      return localeVal;
    }
    // convert to inches
    if (localeUnits) {
      return localeVal / 25.4;
    }
    // convert to mm
    return localeVal * 25.4;
  },

  savePrinterSettingsFromPTNGsettings: async function () {

    var printerList = Cc["@mozilla.org/gfx/printerlist;1"]
		.getService(Ci.nsIPrinterList);

	var printers = await printerList.printers;
	var defaultPrinter = printerList.systemDefaultPrinterName;

	var outputPrinter = null;
	var type = prefs.getPrefType("print_printer");
	if (type) {
		outputPrinter = prefs.getCharPref("print_printer");
	} else {
		console.log("no tb printer")
		outputPrinter = defaultPrinter;
	}


    var printSettings;
    if (PSSVC.newPrintSettings) {
      printSettings = PSSVC.newPrintSettings;
    } else {
      printSettings = PSSVC.createNewPrintSettings();
    }

    printSettings.printerName = outputPrinter;

    PSSVC.initPrintSettingsFromPrefs(printSettings, true, printSettings.kInitSaveAll);
    printSettings.isInitializedFromPrinter = true;

    let printerName = printSettings.printerName;
    let printerNameEsc = printerName.replace(/ /g, '_');

    let t = prefs.getPrefType(`extensions.printingtoolsng.printer.${printerNameEsc}`);

    if (t > 0) {
      printSettings = this.setPrinterSettingsFromPTNGsettings(printSettings);
    } else {
      this.initCustomPrinterOptions(printerName);
      printSettings = this.setPrinterSettingsFromPTNGsettings(printSettings);
    }
 
    console.log(printSettings, PSSVC)
      let savePrefs = Ci.nsIPrintSettings.kInitSaveMargins | Ci.nsIPrintSettings.kInitSaveHeaderLeft |
        Ci.nsIPrintSettings.kInitSaveHeaderCenter | Ci.nsIPrintSettings.kInitSaveHeaderRight |
        Ci.nsIPrintSettings.kInitSaveFooterLeft | Ci.nsIPrintSettings.kInitSaveFooterCenter |
        Ci.nsIPrintSettings.kInitSaveFooterRight |
        Ci.nsIPrintSettings.kInitSaveShrinkToFit |
        Ci.nsIPrintSettings.kInitSaveScaling;
    PSSVC.savePrintSettingsToPrefs(printSettings, true, savePrefs);
  },

  savePrintSettings: function (window) {
    var document = window.document;
    let localeUnits = (locale == "en-US") ? 0 : 1;
    var printSettings;
    if (PSSVC.newPrintSettings) {
      printSettings = PSSVC.newPrintSettings;
    } else {
      printSettings = PSSVC.createNewPrintSettings();
    }

    printSettings.printerName = document.getElementById("OutputPrinter").value;
    PSSVC.initPrintSettingsFromPrefs(printSettings, true, printSettings.kInitSaveAll);

    let nc = Number(document.querySelector("#copies-count").value);

    if (nc < 1 || nc > 1000) {
      nc = 1;
      alert("Copies out of range: set to  1");
    }
    //printSettings.numCopies = nc;

    let prRG = document.querySelector("#pageRangesRG");
    let pr = document.querySelector("#pages");

    if (prRG.selectedIndex == 0) {
      printSettings.pageRanges = [];
    } else if (pr.value == "") {
      alert("Empty page range set to All");
    } else {
      printSettings.pageRanges = this.setPageRangesFromString(pr.value);
    }

    let paperSizeUnit = printSettings.paperSizeUnit;
    let el = document.querySelector("#margin-top");
    let val = this.localeUnitsToInches(Number(el.value), localeUnits);
    printSettings.marginTop = val;

    el = document.querySelector("#margin-bottom");
    val = this.localeUnitsToInches(Number(el.value), localeUnits);
    printSettings.marginBottom = val;

    el = document.querySelector("#margin-left");
    val = this.localeUnitsToInches(Number(el.value), localeUnits);
    printSettings.marginLeft = val;

    el = document.querySelector("#margin-right");
    val = this.localeUnitsToInches(Number(el.value), localeUnits);
    printSettings.marginRight = val;

    el = document.querySelector("#headerleft");
    printSettings.headerStrLeft = el.value;
    el = document.querySelector("#headercenter");
    printSettings.headerStrCenter = el.value;
    el = document.querySelector("#headerright");
    printSettings.headerStrRight = el.value;

    el = document.querySelector("#footerleft");
    printSettings.footerStrLeft = el.value;
    el = document.querySelector("#footercenter");
    printSettings.footerStrCenter = el.value;
    el = document.querySelector("#footerright");
    printSettings.footerStrRight = el.value;

    
    if (nc != 100) {
      console.log("scaling: ", nc)
      printSettings.shrinkToFit = false;
      printSettings.scaling = nc / 100;
    } else {
      printSettings.shrinkToFit = true;
      printSettings.scaling = 1;
    }

    let savePrefs = Ci.nsIPrintSettings.kInitSaveMargins | Ci.nsIPrintSettings.kInitSaveHeaderLeft |
      Ci.nsIPrintSettings.kInitSaveHeaderCenter | Ci.nsIPrintSettings.kInitSaveHeaderRight |
      Ci.nsIPrintSettings.kInitSaveFooterLeft | Ci.nsIPrintSettings.kInitSaveFooterCenter |
      Ci.nsIPrintSettings.kInitSaveFooterRight |
      Ci.nsIPrintSettings.kInitSaveShrinkToFit |
      Ci.nsIPrintSettings.kInitSaveScaling;

    console.log("\nPTNG: Saving prefs on options exit")

    console.log("printer ", printSettings.printerName)
    console.log("paperId ", printSettings.paperId)
    console.log("page units ", printSettings.paperSizeUnit)
    console.log("copies ", printSettings.numCopies)
    console.log("margin top ", printSettings.marginTop)
    console.log("margin bottom ", printSettings.marginBottom)
    console.log("margin left ", printSettings.marginLeft)
    console.log("margin right ", printSettings.marginRight)

    PSSVC.savePrintSettingsToPrefs(printSettings, true, savePrefs);

    let printerName = printSettings.printerName;
    let printerNameEsc = printerName.replace(/ /g, '_');

    let props = prefs.getStringPref(`extensions.printingtoolsng.printer.${printerNameEsc}`);
    var customProps = JSON.parse(props);

    for (const printProperty in customProps) {
      customProps[printProperty] = printSettings[printProperty];
    }

    //customProps.numCopies = nc;
    let js = JSON.stringify(customProps);
    console.log("saving ptng settings")
    console.log(js, printerNameEsc)
    prefs.setStringPref(`extensions.printingtoolsng.printer.${printerNameEsc}`, js);
  },

  initCustomPrinterOptions: function (printerName, units) {
    let printerNameEsc = printerName.replace(/ /g, '_');
    let t = prefs.getPrefType(`extensions.printingtoolsng.printer.${printerNameEsc}`);

    if (t == 0) {
      let customProps = this.defaultPTNGprinterSettings;

      let customPropsStr = JSON.stringify(customProps);
      prefs.setStringPref(`extensions.printingtoolsng.printer.${printerNameEsc}`, customPropsStr);
    }
  },

  setPrinterSettingsFromPTNGsettings: function (printSettings) {
    let printerNameEsc = printSettings.printerName.replace(/ /g, '_');
    let t = prefs.getPrefType(`extensions.printingtoolsng.printer.${printerNameEsc}`);

    if (t == 0) {
      this.initCustomPrinterOptions(printSettings.printerName, printSettings.paperSizeUnit);
    }

    let props = prefs.getStringPref(`extensions.printingtoolsng.printer.${printerNameEsc}`);
    var customProps = JSON.parse(props);

    for (const printProperty in customProps) {
      printSettings[printProperty] = customProps[printProperty];
      //  console.log(printProperty + "" + printerSettings[printProperty]);
    }

       
    if (printSettings.scaling != 1) {
      console.log("scaling: ")
      printSettings.shrinkToFit = false;
      
    } else {
      printSettings.shrinkToFit = true;
      
    }


    return printSettings;
  },

  paperUnitsToInches: function (val, units) {
    if (isNaN(val) || val < 0 || val > 2000) {
      return undefined;
    }
    if (units == 0) {
      return val;
    }
    return val / 25.4;
  },

  // We setup an observer for the preview subdialog so we can set
  // PTNG preferences which are not set in printsettings
  // nCopies and pageRanges are set from PTNG settings

  addPrintPreviewObserver: function () {
    Services.obs.addObserver(this.printPreviewSetPrinterPrefs, "subdialog-loaded");
  },

  removePrintPreviewObserver: function () {
    Services.obs.removeObserver(this.printPreviewSetPrinterPrefs, "subdialog-loaded");
  },

  // observer
  printPreviewSetPrinterPrefs: {

    async observe(subDialogWindow) {
      // A subDialog has been opened.
      // console.log("subDialog opened: " + subDialogWindow.location.href);

      // We only want to deal with the print subDialog.
      if (!subDialogWindow.location.href.startsWith("chrome://global/content/print.html?")) {
        return;
      }

      var prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);

      // Wait until print-settings in the subDialog have been loaded/rendered.
      await new Promise(resolve =>
        subDialogWindow.document.addEventListener("print-settings", resolve, { once: true })
      );

      // console.log("subDialog print-settings loaded");
      console.log(subDialogWindow.document.documentElement.innerHTML)
      let cr = subDialogWindow.document.querySelector("#custom-range");
      let rp = subDialogWindow.document.querySelector("#range-picker");
      let mp = subDialogWindow.document.querySelector("#margins-picker");
      let cmg = subDialogWindow.document.querySelector("#custom-margins");
      let nc = subDialogWindow.document.querySelector("#copies-count");

      let psc = subDialogWindow.document.querySelector("#percent-scale-choice");
      let ps = subDialogWindow.document.querySelector("#percent-scale");
      //console.log()
      //psc.checked = true;

      let printerName = prefs.getCharPref("print_printer").replace(/ /g, '_');

      let props = prefs.getStringPref(`extensions.printingtoolsng.printer.${printerName}`);
      var customProps = JSON.parse(props);

      console.log(customProps)
      let o = [...rp.options];
      let rangeType;
      if (customProps.pageRanges.length == 0) {
        rangeType = "all";
      } else {
        rangeType = "custom";
        cr.removeAttribute("disabled");
        cr.removeAttribute("hidden");
      }

      rp.selectedIndex = o.findIndex(el => el.value == rangeType);
      cmg.removeAttribute("hidden");
      mp.selectedIndex = 3;
      cr.value = printerSettings.pageRangesToString(customProps.pageRanges);

      //ps.value = customProps.numCopies;
      //await new Promise(resolve => subDialogWindow.setTimeout(resolve, 100));
      //nc.value = customProps.numCopies;
      //await new Promise(resolve => subDialogWindow.setTimeout(resolve, 200));
      //nc.value = customProps.numCopies;
      //ps.value = customProps.numCopies;
      //await new Promise(resolve => subDialogWindow.setTimeout(resolve, 350));
      //nc.value = customProps.numCopies;
      //ps.value = customProps.numCopies;
    },
  },
};
