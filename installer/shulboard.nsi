; ShulBoard — מתקין גנרי אחד לכל בתי הכנסת.
;
; הרעיון: לא מקמפלים קובץ לכל בית כנסת. ה-Function מגיש את אותו EXE בדיוק
; תחת שם קובץ אישי — ShulBoard-Setup-<slug>.exe — וההתקנה קוראת את שם הקובץ
; של עצמה ($EXEFILE) כדי לדעת לאיזה בית כנסת היא שייכת.
;
; קימפול (מתוך WSL):
;   sudo apt-get install -y nsis
;   makensis -DBASE_URL=https://shul-board.pages.dev installer/shulboard.nsi
;   העתיקו את הפלט אל public/assets/ShulBoard-Setup.exe

!ifndef BASE_URL
  !define BASE_URL "https://shul-board.pages.dev"
!endif

!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "ShulBoard — צג בית הכנסת"
OutFile "ShulBoard-Setup.exe"
InstallDir "$LOCALAPPDATA\ShulBoard"
RequestExecutionLevel user
Unicode true
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Hebrew"
!insertmacro MUI_LANGUAGE "English"

Var Slug
Var BoardUrl
Var Browser

; מחלץ את המזהה משם הקובץ: ShulBoard-Setup-<slug>.exe
Function ExtractSlug
  StrCpy $Slug ""
  StrLen $0 $EXEFILE
  ; "ShulBoard-Setup-" = 16 תווים; ".exe" = 4
  IntOp $1 $0 - 20
  IntCmp $1 1 done done 0
  done:
  StrCpy $2 $EXEFILE 16
  StrCmp $2 "ShulBoard-Setup-" 0 nomatch
  StrCpy $Slug $EXEFILE $1 16
  Goto end
  nomatch:
  StrCpy $Slug ""
  end:
FunctionEnd

; מאתר Chrome או Edge
Function FindBrowser
  StrCpy $Browser ""
  IfFileExists "$PROGRAMFILES64\Google\Chrome\Application\chrome.exe" 0 +2
    StrCpy $Browser "$PROGRAMFILES64\Google\Chrome\Application\chrome.exe"
  StrCmp $Browser "" 0 +3
  IfFileExists "$PROGRAMFILES32\Google\Chrome\Application\chrome.exe" 0 +2
    StrCpy $Browser "$PROGRAMFILES32\Google\Chrome\Application\chrome.exe"
  StrCmp $Browser "" 0 +3
  IfFileExists "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe" 0 +2
    StrCpy $Browser "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
  StrCmp $Browser "" 0 +3
  IfFileExists "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe" 0 +2
    StrCpy $Browser "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
FunctionEnd

Function .onInit
  Call ExtractSlug
  StrCmp $Slug "" 0 +3
    MessageBox MB_ICONSTOP "שם הקובץ שונה ולכן לא ניתן לזהות את בית הכנסת.$\r$\nהורידו מחדש מדף הניהול ואל תשנו את שם הקובץ."
    Abort
  StrCpy $BoardUrl "${BASE_URL}/s/$Slug"
FunctionEnd

Section "ShulBoard" SecMain
  SetOutPath "$INSTDIR"

  Call FindBrowser
  StrCmp $Browser "" 0 +3
    MessageBox MB_ICONSTOP "לא נמצא דפדפן Chrome או Edge במחשב.$\r$\nהתקינו אחד מהם ונסו שוב."
    Abort

  ; קובץ הפעלה שפותח את הצג במסך מלא
  FileOpen $9 "$INSTDIR\board.cmd" w
  FileWrite $9 "@echo off$\r$\n"
  ; שם המחשב מזהה את המסך ברשימת "מסכים בלייב" בניהול
  FileWrite $9 'start "" "$Browser" --kiosk --start-fullscreen --noerrdialogs --disable-infobars --disable-session-crashed-bubble --incognito "$BoardUrl?screen=%COMPUTERNAME%"$\r$\n'
  FileClose $9

  FileOpen $9 "$INSTDIR\board-url.txt" w
  FileWrite $9 "$BoardUrl$\r$\n"
  FileClose $9

  CreateShortcut "$DESKTOP\צג בית הכנסת.lnk" "$INSTDIR\board.cmd" "" "$Browser" 0 SW_SHOWMINIMIZED
  CreateShortcut "$SMSTARTUP\ShulBoard.lnk" "$INSTDIR\board.cmd" "" "$Browser" 0 SW_SHOWMINIMIZED

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShulBoard" \
    "DisplayName" "ShulBoard — צג בית הכנסת ($Slug)"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShulBoard" \
    "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\ShulBoard" "Slug" "$Slug"
  WriteRegStr HKCU "Software\ShulBoard" "Url" "$BoardUrl"
SectionEnd

Function .onInstSuccess
  Exec '"$INSTDIR\board.cmd"'
FunctionEnd

Section "Uninstall"
  Delete "$SMSTARTUP\ShulBoard.lnk"
  Delete "$DESKTOP\צג בית הכנסת.lnk"
  Delete "$INSTDIR\board.cmd"
  Delete "$INSTDIR\board-url.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShulBoard"
  DeleteRegKey HKCU "Software\ShulBoard"
SectionEnd
