; Register Chiaroscuro as a Windows default browser candidate.
; Adds StartMenuInternet + RegisteredApplications registry entries so the app
; appears in Settings → Default apps.

!define SMI_KEY "Software\Clients\StartMenuInternet\${PRODUCT_FILENAME}"
!define CAPABILITIES_KEY "${SMI_KEY}\Capabilities"
!define REG_APPS_KEY "Software\RegisteredApplications"

!macro customInstall
  ; --- StartMenuInternet root ---
  WriteRegStr SHELL_CONTEXT "${SMI_KEY}" "" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "${SMI_KEY}\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "${SMI_KEY}\shell\open\command" "" '"$appExe"'

  ; --- Capabilities ---
  WriteRegStr SHELL_CONTEXT "${CAPABILITIES_KEY}" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "${CAPABILITIES_KEY}" "ApplicationDescription" "Chiaroscuro Web Browser"
  WriteRegStr SHELL_CONTEXT "${CAPABILITIES_KEY}" "ApplicationIcon" "$appExe,0"

  ; URL associations
  WriteRegStr SHELL_CONTEXT "${CAPABILITIES_KEY}\URLAssociations" "http" "${PRODUCT_FILENAME}URL"
  WriteRegStr SHELL_CONTEXT "${CAPABILITIES_KEY}\URLAssociations" "https" "${PRODUCT_FILENAME}URL"

  ; File associations
  WriteRegStr SHELL_CONTEXT "${CAPABILITIES_KEY}\FileAssociations" ".html" "${PRODUCT_FILENAME}HTML"
  WriteRegStr SHELL_CONTEXT "${CAPABILITIES_KEY}\FileAssociations" ".htm" "${PRODUCT_FILENAME}HTML"
  WriteRegStr SHELL_CONTEXT "${CAPABILITIES_KEY}\FileAssociations" ".mhtml" "${PRODUCT_FILENAME}HTML"
  WriteRegStr SHELL_CONTEXT "${CAPABILITIES_KEY}\FileAssociations" ".svg" "${PRODUCT_FILENAME}HTML"
  WriteRegStr SHELL_CONTEXT "${CAPABILITIES_KEY}\FileAssociations" ".pdf" "${PRODUCT_FILENAME}PDF"

  ; --- ProgID for URL handling ---
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}URL" "" "${PRODUCT_NAME} URL"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}URL" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}URL\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}URL\shell\open\command" "" '"$appExe" "%1"'

  ; --- ProgID for HTML files ---
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}HTML" "" "${PRODUCT_NAME} HTML Document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}HTML\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}HTML\shell\open\command" "" '"$appExe" "%1"'

  ; --- ProgID for PDF files ---
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}PDF" "" "${PRODUCT_NAME} PDF Document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}PDF\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}PDF\shell\open\command" "" '"$appExe" "%1"'

  ; --- RegisteredApplications ---
  WriteRegStr SHELL_CONTEXT "${REG_APPS_KEY}" "${PRODUCT_NAME}" "${CAPABILITIES_KEY}"

  ; Notify shell of association changes
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  ; Remove StartMenuInternet entry
  DeleteRegKey SHELL_CONTEXT "${SMI_KEY}"

  ; Remove ProgIDs
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}URL"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}HTML"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${PRODUCT_FILENAME}PDF"

  ; Remove RegisteredApplications entry
  DeleteRegValue SHELL_CONTEXT "${REG_APPS_KEY}" "${PRODUCT_NAME}"

  ; Notify shell of association changes
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
