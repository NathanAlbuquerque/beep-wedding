# Define que o shell usado pelo make será o bash
SHELL := /bin/bash

# Variáveis
PACKAGE_NAME = com.beepwedding.app
APK_PATH = ./platforms/android/app/build/outputs/apk/debug/app-debug.apk
DEVICE_IP = 192.168.1.50
PORT = 5555
REMOTE_PATH = /sdcard/Download/000_beep-wedding

.PHONY: backup connect mirror install clean uninstall run reinstall logs

# --- COMANDOS JÁ EXISTENTES ---
connect:
	adb connect $(DEVICE_IP):$(PORT)

mirror:
	scrcpy --always-on-top

install:
	adb install -r $(APK_PATH)

uninstall:
	adb uninstall $(PACKAGE_NAME)

clean:
	adb shell pm clear $(PACKAGE_NAME)

# --- BACKUP CORRIGIDO ---
backup:
	@echo "🔍 Verificando versões no celular..."
	@adb shell mkdir -p $(REMOTE_PATH)
	@# Pega a última versão, remove zeros à esquerda para evitar erro de base octal
	@LAST_VER=$$(adb shell "ls $(REMOTE_PATH) 2>/dev/null" | grep -o 'v[0-9]\+' | sed 's/v//' | sed 's/^0*//' | sort -n | tail -1); \
	if [ -z "$$LAST_VER" ]; then \
		NEW_VER=1; \
	else \
		NEW_VER=$$((LAST_VER + 1)); \
	fi; \
	FMT_VER=$$(printf "%02d" $$NEW_VER); \
	NEW_NAME="app-debug-v$$FMT_VER.apk"; \
	echo "🚀 Fazendo backup da versão v$$FMT_VER para o celular..."; \
	adb push $(APK_PATH) $(REMOTE_PATH)/$$NEW_NAME; \
	echo "✅ Backup concluído: $$NEW_NAME"

run:
	adb shell am start -n $(PACKAGE_NAME)/$(PACKAGE_NAME).MainActivity

logs:
	adb logcat *:S $(PACKAGE_NAME):V