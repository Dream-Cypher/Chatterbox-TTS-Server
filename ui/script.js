// ui/script.js
// Client-side JavaScript for the Chatterbox TTS Server web interface.
// Handles UI interactions, API communication, audio playback, and settings management.

document.addEventListener('DOMContentLoaded', async function () {
    // --- Global Flags & State ---
    let uiReady = false;
    let listenersAttached = false;
    let isGenerating = false;
    let wavesurfer = null;
    let currentAudioBlobUrl = null;
    let saveStateTimeout = null;
    let currentPresetName = null;

    // --- Streaming playback state ---
    let currentAbortController = null; // AbortController for the in-flight generation fetch (streaming or non-streaming), if any
    let streamAudioContext = null; // AudioContext reused across streaming generations
    let streamScheduledSources = []; // AudioBufferSourceNodes currently scheduled/playing

    let currentConfig = {};
    let currentUiState = {};
    let appPresets = [];
    let initialReferenceFiles = [];
    let initialPredefinedVoices = [];

    // Model information state
    let currentModelInfo = null;
    let selectedModelSelector = 'chatterbox-turbo';
    let modelChangesPending = false;
    let lastMultilingualLanguage = 'en'; // Remember language selection for Multilingual model

    let hideChunkWarning = false;
    let hideGenerationWarning = false;
    let currentVoiceMode = 'predefined';

    const IS_LOCAL_FILE = window.location.protocol === 'file:';
    // If you always access the server via localhost
    const API_BASE_URL = IS_LOCAL_FILE ? 'http://localhost:8004' : '';

    const DEBOUNCE_DELAY_MS = 750;

    // Language options by model type
    const LANGUAGES_MULTILINGUAL = [
        { code: 'ar', name: 'Arabic (العربية)' },
        { code: 'zh', name: 'Chinese (中文)' },
        { code: 'da', name: 'Danish (Dansk)' },
        { code: 'nl', name: 'Dutch (Nederlands)' },
        { code: 'en', name: 'English' },
        { code: 'fi', name: 'Finnish (Suomi)' },
        { code: 'fr', name: 'French (Français)' },
        { code: 'de', name: 'German (Deutsch)' },
        { code: 'el', name: 'Greek (Ελληνικά)' },
        { code: 'he', name: 'Hebrew (עברית)' },
        { code: 'hi', name: 'Hindi (हिन्दी)' },
        { code: 'it', name: 'Italian (Italiano)' },
        { code: 'ja', name: 'Japanese (日本語)' },
        { code: 'ko', name: 'Korean (한국어)' },
        { code: 'ms', name: 'Malay (Bahasa Melayu)' },
        { code: 'no', name: 'Norwegian (Norsk)' },
        { code: 'pl', name: 'Polish (Polski)' },
        { code: 'pt', name: 'Portuguese (Português)' },
        { code: 'ru', name: 'Russian (Русский)' },
        { code: 'es', name: 'Spanish (Español)' },
        { code: 'sw', name: 'Swahili (Kiswahili)' },
        { code: 'sv', name: 'Swedish (Svenska)' },
        { code: 'tr', name: 'Turkish (Türkçe)' }
    ];
    const LANGUAGES_ENGLISH_ONLY = [
        { code: 'en', name: 'English' }
    ];

    // --- DOM Element Selectors ---
    const appTitleLink = document.getElementById('app-title-link');
    const themeToggleButton = document.getElementById('theme-toggle-btn');
    const themeSwitchThumb = themeToggleButton ? themeToggleButton.querySelector('.theme-switch-thumb') : null;
    const notificationArea = document.getElementById('notification-area');
    const ttsForm = document.getElementById('tts-form');
    const ttsFormHeader = document.getElementById('tts-form-header');
    const textArea = document.getElementById('text');
    const charCount = document.getElementById('char-count');
    const generateBtn = document.getElementById('generate-btn');
    const splitTextToggle = document.getElementById('split-text-toggle');
    const streamToggle = document.getElementById('stream-toggle');
    const chunkSizeControls = document.getElementById('chunk-size-controls');
    const chunkSizeSlider = document.getElementById('chunk-size-slider');
    const chunkSizeValue = document.getElementById('chunk-size-value');
    const chunkExplanation = document.getElementById('chunk-explanation');
    const voiceModeRadios = document.querySelectorAll('input[name="voice_mode"]');
    const predefinedVoiceOptionsDiv = document.getElementById('predefined-voice-options');
    const predefinedVoiceSelect = document.getElementById('predefined-voice-select');
    const predefinedVoiceImportButton = document.getElementById('predefined-voice-import-button');
    const predefinedVoiceRefreshButton = document.getElementById('predefined-voice-refresh-button');
    const predefinedVoiceFileInput = document.getElementById('predefined-voice-file-input');
    const cloneOptionsDiv = document.getElementById('clone-options');
    const cloneReferenceSelect = document.getElementById('clone-reference-select');
    const cloneImportButton = document.getElementById('clone-import-button');
    const cloneRefreshButton = document.getElementById('clone-refresh-button');
    const cloneFileInput = document.getElementById('clone-file-input');
    const presetsContainer = document.getElementById('presets-container');
    const presetsPlaceholder = document.getElementById('presets-placeholder');
    const temperatureSlider = document.getElementById('temperature');
    const temperatureValueDisplay = document.getElementById('temperature-value');
    const exaggerationSlider = document.getElementById('exaggeration');
    const exaggerationValueDisplay = document.getElementById('exaggeration-value');
    const cfgWeightSlider = document.getElementById('cfg-weight');
    const cfgWeightValueDisplay = document.getElementById('cfg-weight-value');
    const speedFactorSlider = document.getElementById('speed-factor');
    const speedFactorValueDisplay = document.getElementById('speed-factor-value');
    const speedFactorWarningSpan = document.getElementById('speed-factor-warning');
    const seedInput = document.getElementById('seed');
    const languageSelectContainer = document.getElementById('language-select-container');
    const languageSelect = document.getElementById('language');
    const outputFormatSelect = document.getElementById('output-format');
    const saveGenDefaultsBtn = document.getElementById('save-gen-defaults-btn');
    const genDefaultsStatus = document.getElementById('gen-defaults-status');
    const serverConfigForm = document.getElementById('server-config-form');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const restartServerBtn = document.getElementById('restart-server-btn');
    const configStatus = document.getElementById('config-status');
    const resetSettingsBtn = document.getElementById('reset-settings-btn');
    const audioPlayerContainer = document.getElementById('audio-player-container');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');
    const loadingStatusText = document.getElementById('loading-status');
    const loadingCancelBtn = document.getElementById('loading-cancel-btn');
    const streamPlaybackIndicator = document.getElementById('stream-playback-indicator');
    const streamStopBtn = document.getElementById('stream-stop-btn');
    const chunkWarningModal = document.getElementById('chunk-warning-modal');
    const chunkWarningOkBtn = document.getElementById('chunk-warning-ok');
    const chunkWarningCancelBtn = document.getElementById('chunk-warning-cancel');
    const hideChunkWarningCheckbox = document.getElementById('hide-chunk-warning-checkbox');
    const generationWarningModal = document.getElementById('generation-warning-modal');
    const generationWarningAcknowledgeBtn = document.getElementById('generation-warning-acknowledge');
    const hideGenerationWarningCheckbox = document.getElementById('hide-generation-warning-checkbox');

    // Model-related elements
    const modelIndicator = document.getElementById('model-indicator');
    const modelBadge = document.getElementById('model-badge');
    const modelBadgeIcon = document.getElementById('model-badge-icon');
    const modelBadgeText = document.getElementById('model-badge-text');
    const modelSelect = document.getElementById('model-select');
    const modelStatusIndicator = document.getElementById('model-status-indicator');
    const modelStatusText = document.getElementById('model-status-text');
    const applyModelBtn = document.getElementById('apply-model-btn');
    const paralinguisticTagsSection = document.getElementById('paralinguistic-tags-section');
    const tagButtonsContainer = document.getElementById('tag-buttons-container');

    // Decorative emoji for paralinguistic tag buttons. Purely cosmetic — if a tag reported by
    // /api/model-info isn't in this map, its button is still built, just without an emoji.
    const TAG_EMOJI = {
        'advertisement': '📢',
        'angry': '😠',
        'chuckle': '😊',
        'clear throat': '🗣️',
        'cough': '🤧',
        'crying': '😢',
        'dramatic': '🎭',
        'fear': '😨',
        'gasp': '😲',
        'groan': '😩',
        'happy': '😃',
        'laugh': '😄',
        'narration': '📖',
        'sarcastic': '😏',
        'shush': '🤫',
        'sigh': '😮‍💨',
        'sniff': '👃',
        'surprised': '😮',
        'whispering': '🤐'
    };

    // Build the "Insert Tag" buttons from the server's available_paralinguistic_tags list
    // (GET /api/model-info) instead of hardcoding them, so the UI can't drift from the engine's
    // actual tag set again. Re-run whenever the loaded model changes.
    function populateTagButtons(tags) {
        if (!tagButtonsContainer) return;
        // Keep the "Insert Tag:" label, drop any previously built buttons.
        tagButtonsContainer.querySelectorAll('.tag-btn').forEach(btn => btn.remove());
        (tags || []).forEach(tag => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tag-btn';
            const bracketedTag = `[${tag}]`;
            button.dataset.tag = bracketedTag;
            button.title = `Insert ${bracketedTag} tag`;
            const emoji = TAG_EMOJI[tag];
            button.textContent = emoji ? `${emoji} ${tag}` : tag;
            button.addEventListener('click', () => insertTagAtCursor(bracketedTag));
            tagButtonsContainer.appendChild(button);
        });
    }


    // Handle voice mode selection visual feedback
    const voiceModeOptions = document.querySelectorAll('.voice-mode__option');

    voiceModeRadios.forEach(radio => {
        radio.addEventListener('change', function () {
            // Remove selected class from all options
            voiceModeOptions.forEach(option => {
                option.classList.remove('selected');
            });

            // Add selected class to the parent of the checked radio
            // CORRECTED: Selector updated to match HTML
            const selectedOption = this.closest('.voice-mode__option');
            if (selectedOption) {
                selectedOption.classList.add('selected');
            }
        });
    });

    // Set initial state
    const checkedRadio = document.querySelector('input[name="voice_mode"]:checked');
    if (checkedRadio) {
        // CORRECTED: Selector updated to match HTML
        const selectedOption = checkedRadio.closest('.voice-mode__option');
        if (selectedOption) {
            selectedOption.classList.add('selected');
        }
    }

    // --- Utility Functions ---
    function formatErrorDetail(detail) {
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) return detail.map(e => e.msg || JSON.stringify(e)).join('; ');
        if (detail && typeof detail === 'object') return JSON.stringify(detail);
        return String(detail);
    }

    function showNotification(message, type = 'info', duration = 5000) {
        if (!notificationArea) return null;

        const icons = {
            success: '<svg class="notification__icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>',
            error: '<svg class="notification__icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>',
            warning: '<svg class="notification__icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>',
            info: '<svg class="notification__icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" /></svg>'
        };

        const notificationDiv = document.createElement('div');
        notificationDiv.className = `notification ${type}`;
        notificationDiv.setAttribute('role', 'alert');

        // Build notification structure
        notificationDiv.innerHTML = `
            ${icons[type] || icons['info']}
            <div class="notification__content"><span>${message}</span></div>
        `;

        // Create close button
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'notification__close';
        closeButton.innerHTML = `
            <span class="sr-only">Close</span>
            <svg class="notification__close-icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
            </svg>
        `;
        closeButton.onclick = () => {
            notificationDiv.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            notificationDiv.style.opacity = '0';
            notificationDiv.style.transform = 'translateY(-20px)';
            setTimeout(() => notificationDiv.remove(), 300);
        };

        notificationDiv.appendChild(closeButton);
        notificationArea.appendChild(notificationDiv);

        if (duration > 0) {
            setTimeout(() => closeButton.click(), duration);
        }

        return notificationDiv;
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${minutes}:${secs}`;
    }

    // --- Theme Management ---
    function applyTheme(theme) {
        const isDark = theme === 'dark';
        document.documentElement.classList.toggle('dark', isDark);

        // WaveSurfer color update
        if (wavesurfer) {
            wavesurfer.setOptions({
                waveColor: isDark ? '#6366f1' : '#a5b4fc',
                progressColor: isDark ? '#4f46e5' : '#6366f1',
                cursorColor: isDark ? '#cbd5e1' : '#475569',
            });
        }

        localStorage.setItem('uiTheme', theme);
    }

    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', () => {
            const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
            applyTheme(newTheme);
            debouncedSaveState();
        });
    }

    // --- UI State Persistence ---
    async function saveCurrentUiState() {
        const stateToSave = {
            last_text: textArea ? textArea.value : '',
            last_voice_mode: currentVoiceMode,
            last_predefined_voice: predefinedVoiceSelect ? predefinedVoiceSelect.value : null,
            last_reference_file: cloneReferenceSelect ? cloneReferenceSelect.value : null,
            last_seed: seedInput ? parseInt(seedInput.value, 10) || 0 : 0,
            last_chunk_size: chunkSizeSlider ? parseInt(chunkSizeSlider.value, 10) : 120,
            last_split_text_enabled: splitTextToggle ? splitTextToggle.checked : true,
            hide_chunk_warning: hideChunkWarning,
            hide_generation_warning: hideGenerationWarning,
            theme: localStorage.getItem('uiTheme') || 'dark',
            last_preset_name: currentPresetName,
        };

        try {
            const response = await fetch(`${API_BASE_URL}/save_settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ui_state: stateToSave })
            });
            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(formatErrorDetail(errorResult.detail) || `Failed to save UI state (status ${response.status})`);
            }
        } catch (error) {
            console.error("Error saving UI state via API:", error);
            showNotification(`Error saving settings: ${error.message}. Some changes may not persist.`, 'error', 0);
        }
    }

    function debouncedSaveState() {
        // Do not save anything until the entire UI has finished its initial setup.
        if (!uiReady || !listenersAttached) { return; }
        clearTimeout(saveStateTimeout);
        saveStateTimeout = setTimeout(saveCurrentUiState, DEBOUNCE_DELAY_MS);
    }

    // --- Speed Factor Warning ---
    function updateSpeedFactorWarning() {
        if (speedFactorSlider && speedFactorWarningSpan) {
            const value = parseFloat(speedFactorSlider.value);
            if (value !== 1.0) {
                speedFactorWarningSpan.textContent = "* Experimental, may cause echo.";
                speedFactorWarningSpan.classList.remove('hidden');
            } else {
                speedFactorWarningSpan.classList.add('hidden');
            }
        }
    }

    // --- Model Management Functions (New Features) ---

    function updateModelUI(modelInfo) {
        if (!modelInfo) {
            console.warn('updateModelUI called with null modelInfo');
            return;
        }

        currentModelInfo = modelInfo;

        // Update model indicator badge
        if (modelIndicator && modelBadge) {
            modelIndicator.classList.remove('hidden');

            // Use simplified modifier classes
            if (modelInfo.type === 'turbo') {
                modelBadge.className = 'model-badge turbo';
                modelBadgeText.textContent = '⚡ Turbo';
            } else if (modelInfo.type === 'nano') {
                modelBadge.className = 'model-badge turbo';
                modelBadgeText.textContent = '⚡ Nano';
            } else if (modelInfo.type === 'multilingual') {
                modelBadge.className = 'model-badge multilingual';
                modelBadgeText.textContent = '🌍 Multilingual';
            } else {
                modelBadge.className = 'model-badge original';
                modelBadgeText.textContent = 'Original';
            }
        }

        // Update model status indicator
        if (modelStatusIndicator && modelStatusText) {
            if (modelInfo.loaded) {
                modelStatusIndicator.className = 'status-dot success';
                modelStatusText.textContent = `${modelInfo.class_name} loaded on ${modelInfo.device}`;
                modelStatusText.className = 'model-status__text success';
            } else {
                modelStatusIndicator.className = 'status-dot error';
                modelStatusText.textContent = 'Model not loaded';
                modelStatusText.className = 'model-status__text error';
            }
        }

        // Update model selector dropdown to match loaded model
        if (modelSelect && !modelChangesPending) {
            let selectorValue = 'chatterbox';
            if (modelInfo.type === 'turbo') {
                selectorValue = 'chatterbox-turbo';
            } else if (modelInfo.type === 'nano') {
                selectorValue = 'chatterbox-nano';
            } else if (modelInfo.type === 'multilingual') {
                selectorValue = 'chatterbox-multilingual';
            }
            modelSelect.value = selectorValue;
            selectedModelSelector = selectorValue;
        }

        // Show/hide model-specific UI sections
        const exaggerationGroup = document.getElementById('exaggeration-group');
        const cfgWeightGroup = document.getElementById('cfg-weight-group');

        // Show/hide paralinguistic tags section (Turbo and Nano only) and (re)build its buttons
        // from the model-reported tag list.
        if (paralinguisticTagsSection) {
            if ((modelInfo.type === 'turbo' || modelInfo.type === 'nano') && modelInfo.supports_paralinguistic_tags) {
                populateTagButtons(modelInfo.available_paralinguistic_tags);
                paralinguisticTagsSection.classList.remove('hidden');
            } else {
                paralinguisticTagsSection.classList.add('hidden');
            }
        }

        // Hide exaggeration and CFG for turbo and nano models (both ignore these params)
        if (modelInfo.type === 'turbo' || modelInfo.type === 'nano') {
            exaggerationGroup?.classList.add('hidden');
            cfgWeightGroup?.classList.add('hidden');
        } else {
            exaggerationGroup?.classList.remove('hidden');
            cfgWeightGroup?.classList.remove('hidden');
        }

        // Refresh presets to filter based on current model type
        populatePresets();

        // Update language options based on model type
        updateLanguageOptions(modelInfo.type);

        console.log('Model UI updated:', modelInfo);
    }

    function updateLanguageOptions(modelType) {
        if (!languageSelect || !languageSelectContainer) return;

        const currentValue = languageSelect.value;
        const isMultilingual = modelType === 'multilingual';
        const languages = isMultilingual ? LANGUAGES_MULTILINGUAL : LANGUAGES_ENGLISH_ONLY;

        // Save current selection before switching away from Multilingual
        if (!isMultilingual && currentValue && currentValue !== 'en') {
            lastMultilingualLanguage = currentValue;
        }

        // Show/hide language selector based on model type
        // Only show for multilingual model (or if config says to show it)
        if (isMultilingual) {
            languageSelectContainer.classList.remove('hidden');
        } else {
            languageSelectContainer.classList.add('hidden');
        }

        // Clear existing options
        languageSelect.innerHTML = '';

        // Populate with appropriate languages
        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.code;
            option.textContent = lang.name;
            languageSelect.appendChild(option);
        });

        // Restore appropriate selection
        if (isMultilingual) {
            // Restore last Multilingual language selection
            languageSelect.value = lastMultilingualLanguage;
        } else {
            languageSelect.value = 'en';
        }
    }

    function insertTagAtCursor(tag) {
        if (!textArea) return;

        const startPos = textArea.selectionStart;
        const endPos = textArea.selectionEnd;
        const textBefore = textArea.value.substring(0, startPos);
        const textAfter = textArea.value.substring(endPos);

        // Insert tag with a space after if not at end and next char isn't a space
        let insertText = tag;
        if (textAfter.length > 0 && textAfter[0] !== ' ') {
            insertText = tag + ' ';
        }

        textArea.value = textBefore + insertText + textAfter;

        // Update cursor position to after the inserted tag
        const newCursorPos = startPos + insertText.length;
        textArea.setSelectionRange(newCursorPos, newCursorPos);
        textArea.focus();

        // Update character count
        if (charCount) {
            charCount.textContent = textArea.value.length;
        }

        // Trigger state save
        debouncedSaveState();
    }

    function handleModelSelectChange() {
        if (!modelSelect) return;

        const newSelector = modelSelect.value;
        let currentSelector = 'chatterbox';
        if (currentModelInfo?.type === 'turbo') {
            currentSelector = 'chatterbox-turbo';
        } else if (currentModelInfo?.type === 'nano') {
            currentSelector = 'chatterbox-nano';
        } else if (currentModelInfo?.type === 'multilingual') {
            currentSelector = 'chatterbox-multilingual';
        }

        if (newSelector !== currentSelector) {
            modelChangesPending = true;

            // Show the apply button
            if (applyModelBtn) {
                applyModelBtn.classList.remove('hidden');
            }

            // Update status indicator and text to show pending state
            if (modelStatusIndicator) {
                modelStatusIndicator.className = 'status-dot warning';
            }
            if (modelStatusText) {
                modelStatusText.textContent = 'Model change pending - click Apply & Restart';
                modelStatusText.className = 'model-status__text warning';
            }
        } else {
            modelChangesPending = false;

            // Hide the apply button
            if (applyModelBtn) {
                applyModelBtn.classList.add('hidden');
            }

            // Restore status from current model info
            updateModelUI(currentModelInfo);
        }
    }


    async function applyModelChange() {
        if (!modelSelect) return;

        const newSelector = modelSelect.value;

        // Update status
        if (modelStatusText) {
            modelStatusText.textContent = 'Saving configuration...';
        }
        if (applyModelBtn) {
            applyModelBtn.disabled = true;
            applyModelBtn.innerHTML = `
                <svg class="btn__icon animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
            `;
        }

        try {
            // Save the model selector to config
            const response = await fetch(`${API_BASE_URL}/save_settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: {
                        repo_id: newSelector
                    }
                })
            });

            if (!response.ok) {
                const errorResult = await response.json().catch(() => ({ detail: 'Failed to save' }));
                throw new Error(formatErrorDetail(errorResult.detail) || 'Failed to save model configuration');
            }

            showNotification('Model configuration saved. Initiating server restart...', 'info');

            // Trigger server restart
            const restartResponse = await fetch(`${API_BASE_URL}/restart_server`, {
                method: 'POST'
            });

            if (restartResponse.ok) {
                showNotification(
                    'Model configuration saved. Waiting for the server to come back online...',
                    'success',
                    6000
                );

                // Poll until the server actually answers rather than reloading on a fixed
                // timer: loading a model takes far longer than the 5s this used to wait, so
                // the reload landed on a server that was still starting up.
                await waitForServerRestart(applyModelBtn, null);
            } else {
                showNotification(
                    'Configuration saved. Please restart the server manually for changes to take effect.',
                    'warning',
                    0
                );
            }

        } catch (error) {
            console.error('Error applying model change:', error);
            showNotification(`Error: ${error.message}`, 'error');

            // Re-enable button
            if (applyModelBtn) {
                applyModelBtn.disabled = false;
                applyModelBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Apply & Restart
                `;
            }
        }
    }


    // --- Initial Application Setup ---
    function initializeApplication() {
        const preferredTheme = localStorage.getItem('uiTheme') || currentUiState.theme || 'dark';
        applyTheme(preferredTheme);
        const pageTitle = currentConfig?.ui?.title || "Chatterbox TTS Server";
        document.title = pageTitle;
        if (appTitleLink) appTitleLink.textContent = pageTitle;
        if (ttsFormHeader) ttsFormHeader.textContent = `Generate Speech`;
        loadInitialUiState();
        populatePredefinedVoices();
        populateReferenceFiles();
        populatePresets();
        displayServerConfiguration();
        if (languageSelectContainer && currentConfig?.ui?.show_language_select === false) {
            languageSelectContainer.classList.add('hidden');
        }
        updateSpeedFactorWarning(); // Initial check for speed factor warning
        const initialGenResult = currentConfig.initial_gen_result;
        if (initialGenResult && initialGenResult.outputUrl) {
            initializeWaveSurfer(initialGenResult.outputUrl, initialGenResult);
        }
    }

    async function fetchInitialData() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/ui/initial-data`);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch initial UI data: ${response.status} ${response.statusText}. Server response: ${errorText}`);
            }
            const data = await response.json();
            currentConfig = data.config || {};
            currentUiState = currentConfig.ui_state || {};
            appPresets = data.presets || [];
            initialReferenceFiles = data.reference_files || [];
            initialPredefinedVoices = data.predefined_voices || [];
            hideChunkWarning = currentUiState.hide_chunk_warning || false;
            hideGenerationWarning = currentUiState.hide_generation_warning || false;
            currentVoiceMode = currentUiState.last_voice_mode || 'predefined';

            // NEW: Handle model info from initial data
            if (data.model_info) {
                updateModelUI(data.model_info);
            }

            initializeApplication();

        } catch (error) {
            console.error("Error fetching initial data:", error);
            showNotification(`Could not load essential application data: ${error.message}. Please try refreshing.`, 'error', 0);
            if (Object.keys(currentConfig).length === 0) {
                currentConfig = { ui: { title: "Chatterbox TTS Server (Error Mode)" }, generation_defaults: {}, ui_state: {} };
                currentUiState = currentConfig.ui_state;
            }
            initializeApplication(); // Attempt to init in a degraded state
        } finally {
            // --- PHASE 2: Attach listeners and enable UI readiness ---
            // This pushes the listener attachment to the end of the event queue,
            // ensuring all initialization events have fired harmlessly before we start listening.
            setTimeout(() => {
                attachStateSavingListeners();
                listenersAttached = true;
                uiReady = true;
            }, 50); // A 50ms delay is more robust than 0ms for complex UIs.
        }
    }

    function loadInitialUiState() {
        if (textArea && currentUiState.last_text) {
            textArea.value = currentUiState.last_text;
            if (charCount) charCount.textContent = textArea.value.length;
        }

        // Handle Voice Mode Selection
        const modeRadioToSelect = document.querySelector(`input[name="voice_mode"][value="${currentVoiceMode}"]`);

        if (modeRadioToSelect) {
            modeRadioToSelect.checked = true;
            // FIX: Manually fire the change event so the .selected class updates visually
            modeRadioToSelect.dispatchEvent(new Event('change'));
        } else {
            const defaultRadio = document.querySelector('input[name="voice_mode"][value="predefined"]');
            if (defaultRadio) {
                defaultRadio.checked = true;
                currentVoiceMode = 'predefined';
                defaultRadio.dispatchEvent(new Event('change'));
            }
        }

        toggleVoiceOptionsDisplay();

        if (seedInput && currentUiState.last_seed !== undefined) seedInput.value = currentUiState.last_seed;
        else if (seedInput && currentConfig?.generation_defaults?.seed !== undefined) seedInput.value = currentConfig.generation_defaults.seed;

        if (splitTextToggle) splitTextToggle.checked = currentUiState.last_split_text_enabled !== undefined ? currentUiState.last_split_text_enabled : true;

        if (chunkSizeSlider && currentUiState.last_chunk_size !== undefined) chunkSizeSlider.value = currentUiState.last_chunk_size;
        if (chunkSizeValue) chunkSizeValue.textContent = chunkSizeSlider ? chunkSizeSlider.value : '120';
        toggleChunkControlsVisibility();

        const genDefaults = currentConfig.generation_defaults || {};
        if (temperatureSlider) temperatureSlider.value = genDefaults.temperature !== undefined ? genDefaults.temperature : 0.8;
        if (temperatureValueDisplay) temperatureValueDisplay.textContent = temperatureSlider.value;
        if (exaggerationSlider) exaggerationSlider.value = genDefaults.exaggeration !== undefined ? genDefaults.exaggeration : 0.5;
        if (exaggerationValueDisplay) exaggerationValueDisplay.textContent = exaggerationSlider.value;
        if (cfgWeightSlider) cfgWeightSlider.value = genDefaults.cfg_weight !== undefined ? genDefaults.cfg_weight : 0.5;
        if (cfgWeightValueDisplay) cfgWeightValueDisplay.textContent = cfgWeightSlider.value;
        if (speedFactorSlider) speedFactorSlider.value = genDefaults.speed_factor !== undefined ? genDefaults.speed_factor : 1.0;
        if (speedFactorValueDisplay) speedFactorValueDisplay.textContent = speedFactorSlider.value;
        if (languageSelect) languageSelect.value = genDefaults.language || 'en';
        if (outputFormatSelect) outputFormatSelect.value = currentConfig?.audio_output?.format || 'mp3';

        if (hideChunkWarningCheckbox) hideChunkWarningCheckbox.checked = hideChunkWarning;
        if (hideGenerationWarningCheckbox) hideGenerationWarningCheckbox.checked = hideGenerationWarning;

        // --- PRESET RESTORATION LOGIC ---

        // 1. Restore the name from state variable
        if (currentUiState.last_preset_name) {
            currentPresetName = currentUiState.last_preset_name;
        }

        // 2. Logic to apply preset (if empty) OR just highlight button (if text exists)
        if (textArea && !textArea.value && appPresets && appPresets.length > 0) {
            // Case A: No text entered. We want to load a preset fully.
            // Priority: Saved preset > "Standard Narration" > First available
            const savedPreset = appPresets.find(p => p.name === currentPresetName);
            const defaultPreset = savedPreset || appPresets.find(p => p.name === "Standard Narration") || appPresets[0];

            if (defaultPreset) {
                // Apply values AND visuals, no notification, no save
                applyPreset(defaultPreset, false, false);
            }
        } else if (currentPresetName) {
            // Case B: Text already exists (restored from last_text). 
            // We don't want to overwrite parameters, but we want to show which preset button was active.
            updatePresetVisuals(currentPresetName);
        }
    }

    function attachStateSavingListeners() {
        voiceModeRadios.forEach(radio => {
            radio.addEventListener('change', debouncedSaveState);
        });

        if (textArea) textArea.addEventListener('input', () => { if (charCount) charCount.textContent = textArea.value.length; debouncedSaveState(); });
        if (predefinedVoiceSelect) predefinedVoiceSelect.addEventListener('change', debouncedSaveState);
        if (cloneReferenceSelect) cloneReferenceSelect.addEventListener('change', debouncedSaveState);
        if (seedInput) seedInput.addEventListener('change', debouncedSaveState);
        if (splitTextToggle) splitTextToggle.addEventListener('change', () => { toggleChunkControlsVisibility(); debouncedSaveState(); });
        if (chunkSizeSlider) {
            chunkSizeSlider.addEventListener('input', () => { if (chunkSizeValue) chunkSizeValue.textContent = chunkSizeSlider.value; });
            chunkSizeSlider.addEventListener('change', debouncedSaveState);
        }
        const genParamSliders = [temperatureSlider, exaggerationSlider, cfgWeightSlider, speedFactorSlider];
        genParamSliders.forEach(slider => {
            if (slider) {
                const valueDisplayId = slider.id + '-value';
                const valueDisplay = document.getElementById(valueDisplayId);
                slider.addEventListener('input', () => {
                    if (valueDisplay) valueDisplay.textContent = slider.value;
                    if (slider.id === 'speed-factor') updateSpeedFactorWarning(); // Update warning on input
                });
                slider.addEventListener('change', debouncedSaveState);
            }
        });
        if (languageSelect) languageSelect.addEventListener('change', debouncedSaveState);
        if (outputFormatSelect) outputFormatSelect.addEventListener('change', debouncedSaveState);

        // NEW: Model management listeners
        if (modelSelect) {
            modelSelect.addEventListener('change', handleModelSelectChange);
        }

        if (applyModelBtn) {
            applyModelBtn.addEventListener('click', applyModelChange);
        }

        // Tag button click listeners are attached in populateTagButtons(), since the buttons
        // are rebuilt from the API response whenever the loaded model changes.
    }

    // --- Dynamic UI Population ---
    function populatePredefinedVoices(voicesData = initialPredefinedVoices) {
        if (!predefinedVoiceSelect) return;
        const currentSelectedValue = predefinedVoiceSelect.value;
        predefinedVoiceSelect.innerHTML = '<option value="none">-- Select Voice --</option>';
        voicesData.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.filename;
            option.textContent = voice.display_name || voice.filename;
            predefinedVoiceSelect.appendChild(option);
        });
        const lastSelected = currentUiState.last_predefined_voice;
        const defaultFromConfig = currentConfig?.tts_engine?.default_voice_id;
        if (currentSelectedValue !== 'none' && voicesData.some(v => v.filename === currentSelectedValue)) {
            predefinedVoiceSelect.value = currentSelectedValue;
        } else if (lastSelected && voicesData.some(v => v.filename === lastSelected)) {
            predefinedVoiceSelect.value = lastSelected;
        } else if (defaultFromConfig && voicesData.some(v => v.filename === defaultFromConfig)) {
            predefinedVoiceSelect.value = defaultFromConfig;
        } else {
            predefinedVoiceSelect.value = 'none';
        }
    }

    function populateReferenceFiles(filesData = initialReferenceFiles) {
        if (!cloneReferenceSelect) return;
        const currentSelectedValue = cloneReferenceSelect.value;
        cloneReferenceSelect.innerHTML = '<option value="none">-- Select Reference File --</option>';
        filesData.forEach(filename => {
            const option = document.createElement('option');
            option.value = filename;
            option.textContent = filename;
            cloneReferenceSelect.appendChild(option);
        });
        const lastSelected = currentUiState.last_reference_file;
        if (currentSelectedValue !== 'none' && filesData.includes(currentSelectedValue)) {
            cloneReferenceSelect.value = currentSelectedValue;
        } else if (lastSelected && filesData.includes(lastSelected)) {
            cloneReferenceSelect.value = lastSelected;
        } else {
            cloneReferenceSelect.value = 'none';
        }
    }

    function updatePresetVisuals(name) {
        currentPresetName = name;

        // Find all preset buttons
        const buttons = document.querySelectorAll('.preset-btn');
        buttons.forEach(btn => {
            // We will add data-name to buttons in the next step
            if (btn.dataset.name === name) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }

    function populatePresets() {
        if (!presetsContainer || !appPresets) return;

        // Filter presets based on current model
        // Hide "Turbo" presets (tag demonstrations) when Original/Multilingual is loaded, since
        // those models don't support paralinguistic tags. Match on "turbo" anywhere in the name
        // (not startsWith) because these preset names are prefixed with the "⚡" emoji.
        let filteredPresets = appPresets;
        if (currentModelInfo && currentModelInfo.type !== 'turbo' && currentModelInfo.type !== 'nano') {
            filteredPresets = appPresets.filter(preset =>
                !preset.name.toLowerCase().includes('turbo')
            );
        }

        // Clear container
        presetsContainer.innerHTML = '';

        if (filteredPresets.length === 0) {
            const placeholder = document.createElement('p');
            placeholder.className = 'form-hint';
            placeholder.textContent = 'No presets available for this model.';
            presetsContainer.appendChild(placeholder);
            return;
        }

        filteredPresets.forEach((preset, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.id = `preset-btn-${index}`;
            button.className = 'preset-btn';
            button.dataset.name = preset.name;
            button.title = `Load '${preset.name}' preset`;
            button.textContent = preset.name;
            button.addEventListener('click', () => applyPreset(preset));
            presetsContainer.appendChild(button);
        });

        if (currentPresetName) {
            updatePresetVisuals(currentPresetName);
        }
    }

    function applyPreset(presetData, showNotif = true, isUserInteraction = true) {
        if (!presetData) return;
        if (textArea && presetData.text !== undefined) {
            textArea.value = presetData.text;
            if (charCount) charCount.textContent = textArea.value.length;
        }
        const genParams = presetData.params || presetData;
        if (temperatureSlider && genParams.temperature !== undefined) temperatureSlider.value = genParams.temperature;
        if (exaggerationSlider && genParams.exaggeration !== undefined) exaggerationSlider.value = genParams.exaggeration;
        if (cfgWeightSlider && genParams.cfg_weight !== undefined) cfgWeightSlider.value = genParams.cfg_weight;
        if (speedFactorSlider && genParams.speed_factor !== undefined) speedFactorSlider.value = genParams.speed_factor;
        if (seedInput && genParams.seed !== undefined) seedInput.value = genParams.seed;
        if (languageSelect && genParams.language !== undefined) languageSelect.value = genParams.language;
        if (temperatureValueDisplay && temperatureSlider) temperatureValueDisplay.textContent = temperatureSlider.value;
        if (exaggerationValueDisplay && exaggerationSlider) exaggerationValueDisplay.textContent = exaggerationSlider.value;
        if (cfgWeightValueDisplay && cfgWeightSlider) cfgWeightValueDisplay.textContent = cfgWeightSlider.value;
        if (speedFactorValueDisplay && speedFactorSlider) speedFactorValueDisplay.textContent = speedFactorSlider.value;
        updateSpeedFactorWarning();

        if (genParams.voice_id && predefinedVoiceSelect) {
            const voiceExists = Array.from(predefinedVoiceSelect.options).some(opt => opt.value === genParams.voice_id);
            if (voiceExists) {
                predefinedVoiceSelect.value = genParams.voice_id;
                const predefinedRadio = document.querySelector('input[name="voice_mode"][value="predefined"]');
                if (predefinedRadio) {
                    predefinedRadio.checked = true;
                    predefinedRadio.dispatchEvent(new Event('change', { bubbles: true }));
                }
                toggleVoiceOptionsDisplay();
            }
        } else if (genParams.reference_audio_filename && cloneReferenceSelect) {
            const refExists = Array.from(cloneReferenceSelect.options).some(opt => opt.value === genParams.reference_audio_filename);
            if (refExists) {
                cloneReferenceSelect.value = genParams.reference_audio_filename;
                const cloneRadio = document.querySelector('input[name="voice_mode"][value="clone"]');
                if (cloneRadio) {
                    cloneRadio.checked = true;
                    cloneRadio.dispatchEvent(new Event('change', { bubbles: true }));
                }
                toggleVoiceOptionsDisplay();
            }
        }

        if (presetData.name) {
            updatePresetVisuals(presetData.name);
        }

        if (showNotif) showNotification(`Preset "${presetData.name}" loaded.`, 'info', 3000);
        if (isUserInteraction) {
            debouncedSaveState();
        }
    }

    // --- Voice Mode and Options Visibility ---
    function toggleVoiceOptionsDisplay() {
        const selectedMode = document.querySelector('input[name="voice_mode"]:checked')?.value;
        currentVoiceMode = selectedMode;
        if (predefinedVoiceOptionsDiv) predefinedVoiceOptionsDiv.classList.toggle('hidden', selectedMode !== 'predefined');
        if (cloneOptionsDiv) cloneOptionsDiv.classList.toggle('hidden', selectedMode !== 'clone');
        if (predefinedVoiceSelect) predefinedVoiceSelect.required = (selectedMode === 'predefined');
        if (cloneReferenceSelect) cloneReferenceSelect.required = (selectedMode === 'clone');
    }
    voiceModeRadios.forEach(radio => radio.addEventListener('change', toggleVoiceOptionsDisplay));

    function toggleChunkControlsVisibility() {
        const isChecked = splitTextToggle ? splitTextToggle.checked : false;
        if (chunkSizeControls) chunkSizeControls.classList.toggle('hidden', !isChecked);
        if (chunkExplanation) chunkExplanation.classList.toggle('hidden', !isChecked);
    }
    if (splitTextToggle) toggleChunkControlsVisibility();

    // --- Audio Player (WaveSurfer) ---
    // scrollToPlayer: pass false when the player is being (re)populated while the user's
    // attention is deliberately elsewhere — e.g. handing the final blob to WaveSurfer once a
    // stream finishes, where the streaming indicator already scrolled into view when playback
    // started and scheduled Web Audio buffers may still be sounding.
    function initializeWaveSurfer(audioUrl, resultDetails = {}, scrollToPlayer = true) {
        if (wavesurfer) {
            wavesurfer.unAll(); // Remove all event listeners before destroying
            wavesurfer.destroy();
            wavesurfer = null;
        }
        if (currentAudioBlobUrl) {
            URL.revokeObjectURL(currentAudioBlobUrl);
            currentAudioBlobUrl = null;
        }
        currentAudioBlobUrl = audioUrl;

        // Ensure the container is clean or re-created
        audioPlayerContainer.innerHTML = `
            <div class="card audio-player">
                <div class="card__body">
                    <h2 class="card__title">Generated Audio</h2>
                    <div class="audio-player__waveform" id="waveform"></div>
                    <div class="audio-player__controls">
                        <div class="audio-player__buttons">
                            <button id="play-btn" class="btn primary" disabled>
                                <svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm6.39-2.908a.75.75 0 0 1 .766.027l3.5 2.25a.75.75 0 0 1 0 1.262l-3.5 2.25A.75.75 0 0 1 8 12.25v-4.5a.75.75 0 0 1 .39-.658Z" clip-rule="evenodd" />
                                </svg>
                                <span>Play</span>
                            </button>
                            <a id="download-link" href="#" download="tts_output.wav" class="btn secondary disabled">
                                <svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"/>
                                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"/>
                                </svg>
                                <span>Download</span>
                            </a>
                        </div>
                        <div class="audio-player__info">
                            Mode: <span id="player-voice-mode" class="text-primary">--</span>
                            <span id="player-voice-file-details"></span>
                            <span class="separator">•</span> Gen Time: <span id="player-gen-time" class="tabular-nums">--s</span>
                            <span class="separator">•</span> Duration: <span id="audio-duration" class="tabular-nums">--:--</span>
                        </div>
                    </div>
                </div>
            </div>`;

        // Re-select elements after recreating them
        const waveformDiv = audioPlayerContainer.querySelector('#waveform');
        const playBtn = audioPlayerContainer.querySelector('#play-btn');
        const downloadLink = audioPlayerContainer.querySelector('#download-link');
        const playerModeSpan = audioPlayerContainer.querySelector('#player-voice-mode');
        const playerFileSpan = audioPlayerContainer.querySelector('#player-voice-file-details');
        const playerGenTimeSpan = audioPlayerContainer.querySelector('#player-gen-time');
        const audioDurationSpan = audioPlayerContainer.querySelector('#audio-duration');

        const audioFilename = resultDetails.filename || (typeof audioUrl === 'string' ? audioUrl.split('/').pop() : 'tts_output.wav');
        if (downloadLink) {
            downloadLink.href = audioUrl;
            downloadLink.download = audioFilename;
            const downloadTextSpan = downloadLink.querySelector('span'); // Target the span for text update
            if (downloadTextSpan) {
                downloadTextSpan.textContent = `Download ${audioFilename.split('.').pop().toUpperCase()}`;
            }
        }
        if (playerModeSpan) playerModeSpan.textContent = resultDetails.submittedVoiceMode || currentVoiceMode || '--';
        if (playerFileSpan) {
            let fileDetail = '';
            if ((resultDetails.submittedVoiceMode || currentVoiceMode) === 'clone' && resultDetails.submittedCloneFile) {
                fileDetail = `(<span class="font-medium text-slate-700 dark:text-slate-300">${resultDetails.submittedCloneFile}</span>)`;
            } else if ((resultDetails.submittedVoiceMode || currentVoiceMode) === 'predefined' && resultDetails.submittedPredefinedVoice) {
                fileDetail = `(<span class="font-medium text-slate-700 dark:text-slate-300">${resultDetails.submittedPredefinedVoice}</span>)`;
            }
            playerFileSpan.innerHTML = fileDetail;
        }
        if (playerGenTimeSpan) playerGenTimeSpan.textContent = resultDetails.genTime ? `${resultDetails.genTime}s` : '--s';

        const playIconSVG = `<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm6.39-2.908a.75.75 0 0 1 .766.027l3.5 2.25a.75.75 0 0 1 0 1.262l-3.5 2.25A.75.75 0 0 1 8 12.25v-4.5a.75.75 0 0 1 .39-.658Z" clip-rule="evenodd" /></svg><span>Play</span>`;
        const pauseIconSVG = `<svg class="btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm5-2.25A.75.75 0 0 1 7.75 7h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Zm4 0a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Z" clip-rule="evenodd" /></svg><span>Pause</span>`;
        const isDark = document.documentElement.classList.contains('dark');

        wavesurfer = WaveSurfer.create({
            container: waveformDiv, waveColor: isDark ? '#6366f1' : '#a5b4fc', progressColor: isDark ? '#4f46e5' : '#6366f1',
            cursorColor: isDark ? '#cbd5e1' : '#475569', barWidth: 3, barRadius: 3, cursorWidth: 1, height: 80, barGap: 2,
            responsive: true, url: audioUrl, mediaControls: false, normalize: true, autoplay: false,
        });

        wavesurfer.on('ready', () => {
            const duration = wavesurfer.getDuration();
            if (audioDurationSpan) audioDurationSpan.textContent = formatTime(duration);
            if (playBtn) {
                playBtn.disabled = false;
                playBtn.innerHTML = playIconSVG;
            }
            if (downloadLink) {
                downloadLink.classList.remove('disabled');
                downloadLink.removeAttribute('aria-disabled');
            }
        });
        wavesurfer.on('play', () => { if (playBtn) playBtn.innerHTML = pauseIconSVG; });
        wavesurfer.on('pause', () => { if (playBtn) playBtn.innerHTML = playIconSVG; });
        wavesurfer.on('finish', () => { if (playBtn) playBtn.innerHTML = playIconSVG; wavesurfer.seekTo(0); });
        wavesurfer.on('error', (err) => {
            console.error("WaveSurfer error:", err);
            showNotification(`Error loading audio waveform: ${err.message || err}`, 'error');
            if (waveformDiv) waveformDiv.innerHTML = `<p class="p-4 text-sm text-red-600 dark:text-red-400">Could not load waveform.</p>`;
            if (playBtn) playBtn.disabled = true;
        });

        if (playBtn) {
            playBtn.onclick = () => {
                if (wavesurfer) {
                    wavesurfer.playPause();
                }
            };
        }
        // scrollToPlayer is retained as a parameter for callers, but is intentionally a no-op:
        // the player now sits directly beneath the Generate button rather than at the foot of
        // the page, so it is already on screen and stealing the scroll position would only
        // interrupt someone mid-read or mid-edit.
        void scrollToPlayer;
    }

    // --- TTS Generation Logic ---
    function getTTSFormData() {
        const jsonData = {
            text: textArea.value,
            temperature: parseFloat(temperatureSlider.value),
            exaggeration: parseFloat(exaggerationSlider.value),
            cfg_weight: parseFloat(cfgWeightSlider.value),
            speed_factor: parseFloat(speedFactorSlider.value),
            seed: parseInt(seedInput.value, 10),
            language: languageSelect.value,
            voice_mode: currentVoiceMode,
            split_text: splitTextToggle.checked,
            chunk_size: parseInt(chunkSizeSlider.value, 10),
            output_format: outputFormatSelect.value || 'mp3',
            stream: !!(streamToggle && streamToggle.checked)
        };
        if (currentVoiceMode === 'predefined' && predefinedVoiceSelect.value !== 'none') {
            jsonData.predefined_voice_id = predefinedVoiceSelect.value;
        } else if (currentVoiceMode === 'clone' && cloneReferenceSelect.value !== 'none') {
            jsonData.reference_audio_filename = cloneReferenceSelect.value;
        }
        return jsonData;
    }

    async function submitTTSRequest() {
        isGenerating = true;
        const jsonData = getTTSFormData();

        // Streaming needs the Web Audio API to schedule PCM as it arrives; WaveSurfer itself
        // cannot play a stream, it needs a complete buffer. If this browser lacks AudioContext,
        // degrade silently to the normal request/response path below rather than breaking.
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const willStream = !!(jsonData.stream && AudioContextClass);
        showLoadingOverlay(willStream);
        if (willStream) {
            await submitTTSRequestStreaming(jsonData);
            return;
        }
        jsonData.stream = false;

        const controller = new AbortController();
        currentAbortController = controller;

        const startTime = performance.now();
        try {
            const response = await fetch(`${API_BASE_URL}/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jsonData),
                signal: controller.signal
            });
            if (!response.ok) {
                const errorResult = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
                throw new Error(formatErrorDetail(errorResult.detail) || 'TTS generation failed.');
            }
            const audioBlob = await response.blob();
            const endTime = performance.now();
            const genTime = ((endTime - startTime) / 1000).toFixed(2);
            const filenameFromServer = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'generated_audio.wav';
            const resultDetails = {
                outputUrl: URL.createObjectURL(audioBlob), filename: filenameFromServer, genTime: genTime,
                submittedVoiceMode: jsonData.voice_mode, submittedPredefinedVoice: jsonData.predefined_voice_id,
                submittedCloneFile: jsonData.reference_audio_filename
            };
            initializeWaveSurfer(resultDetails.outputUrl, resultDetails);
            showNotification('Audio generated successfully!', 'success');
        } catch (error) {
            if (error.name === 'AbortError') {
                // Cancelled by the user — stopStreamingGeneration() already reset the UI.
                // Unlike streaming, a non-streaming request has no partial audio to keep.
                return;
            }
            console.error('TTS Generation Error:', error);
            showNotification(error.message || 'An unknown error occurred during TTS generation.', 'error');
        } finally {
            currentAbortController = null;
            isGenerating = false;
            hideLoadingOverlay();
        }
    }

    // --- Streaming TTS Generation ---

    // Parses a WAV header by walking its RIFF chunks rather than assuming fixed offsets, since
    // the server (server.py's _create_wav_header) writes a placeholder 0xFFFFFFFF data size for
    // streaming responses — the real sample rate/channels/bit depth must be read from the 'fmt '
    // chunk, and the 'data' chunk's declared size must be ignored (bytes are simply consumed
    // until the stream ends). Returns null if `bytes` doesn't yet contain a full header.
    function parseWavHeader(bytes) {
        if (bytes.length < 12) return null;
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (dv.getUint32(0, false) !== 0x52494646 /* 'RIFF' */ || dv.getUint32(8, false) !== 0x57415645 /* 'WAVE' */) {
            return null;
        }
        let offset = 12;
        let fmt = null;
        while (offset + 8 <= bytes.length) {
            const chunkId = dv.getUint32(offset, false);
            const chunkSize = dv.getUint32(offset + 4, true);
            const bodyOffset = offset + 8;
            if (chunkId === 0x666d7420 /* 'fmt ' */) {
                if (bodyOffset + 16 > bytes.length) return null; // fmt chunk not fully buffered yet
                fmt = {
                    numChannels: dv.getUint16(bodyOffset + 2, true),
                    sampleRate: dv.getUint32(bodyOffset + 4, true),
                    bitsPerSample: dv.getUint16(bodyOffset + 14, true)
                };
                offset = bodyOffset + chunkSize + (chunkSize % 2);
            } else if (chunkId === 0x64617461 /* 'data' */) {
                if (!fmt) return null; // malformed: data before fmt
                return { ...fmt, dataOffset: bodyOffset };
            } else {
                offset = bodyOffset + chunkSize + (chunkSize % 2);
            }
        }
        return null; // haven't seen the 'data' chunk header yet — need more bytes
    }

    function pcm16BytesToFloat32(bytes) {
        const sampleCount = bytes.length >> 1;
        const out = new Float32Array(sampleCount);
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let i = 0; i < sampleCount; i++) {
            out[i] = dv.getInt16(i * 2, true) / 32768;
        }
        return out;
    }

    function concatBytes(a, b) {
        const out = new Uint8Array(a.length + b.length);
        out.set(a, 0);
        out.set(b, a.length);
        return out;
    }

    function stopStreamPlayback() {
        streamScheduledSources.forEach((src) => {
            try { src.stop(); } catch (e) { /* already stopped/finished */ }
        });
        streamScheduledSources = [];
    }

    // --- Streaming playback indicator ---
    // Shown in place of the loading overlay from the moment the first chunk is scheduled
    // (audio is already playing at that point) until the scheduled Web Audio buffers have
    // actually finished sounding — not merely until the fetch completes, since a fast server
    // can finish sending bytes well before real-time playback of them is done.
    function showStreamIndicator() {
        if (!streamPlaybackIndicator) return;
        streamPlaybackIndicator.classList.remove('hidden');
        // No scrolling: the indicator and player sit directly under the Generate button, so
        // they are already in view. Moving the page under someone who may be reading or
        // typing is worse than leaving it alone.
    }
    function hideStreamIndicator() {
        if (streamPlaybackIndicator) streamPlaybackIndicator.classList.add('hidden');
    }

    // Marks a streaming generation as fully done from the user's perspective: audio has
    // actually stopped (naturally or via Stop), so the Generate button and player should read
    // as idle/replayable again.
    function finishStreamingPlayback() {
        hideStreamIndicator();
        isGenerating = false;
    }

    // Watches the last scheduled source so the indicator comes down only once real playback
    // ends, not when the fetch merely finishes. Idempotent — safe to invoke even if playback
    // was already stopped by the user.
    function attachStreamCompletionHandler() {
        const lastSource = streamScheduledSources[streamScheduledSources.length - 1];
        if (!lastSource) {
            finishStreamingPlayback();
            return;
        }
        lastSource.onended = () => finishStreamingPlayback();
    }

    // Shared teardown for the "Cancel" button on the loading overlay (streaming pre-first-chunk,
    // or a non-streaming request in flight) and the "Stop" button on the streaming indicator
    // (post-first-chunk): abort whichever fetch is in flight, stop every scheduled source, and
    // return the UI to idle. Whatever streaming audio already arrived stays loaded in WaveSurfer
    // via the AbortError branch in submitTTSRequestStreaming; a non-streaming request has no
    // partial audio to keep (its own AbortError branch in submitTTSRequest just returns).
    //
    // Note on what cancellation can actually do: engine.synthesize has no cancellation hook, so
    // whichever chunk is already being generated server-side finishes regardless — aborting here
    // only stops the chunks after it. For a single-chunk request, that means Cancel/Stop has no
    // effect on the current work at all.
    function stopStreamingGeneration(notifyMessage) {
        if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
        stopStreamPlayback();
        hideLoadingOverlay();
        finishStreamingPlayback();
        if (notifyMessage) showNotification(notifyMessage, 'info');
    }

    async function submitTTSRequestStreaming(jsonData) {
        const startTime = performance.now();
        let firstChunkLogged = false;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!streamAudioContext || streamAudioContext.state === 'closed') {
            streamAudioContext = new AudioContextClass();
        }
        const audioCtx = streamAudioContext;
        let nextStartTime = audioCtx.currentTime;
        streamScheduledSources = [];

        const controller = new AbortController();
        currentAbortController = controller;

        const receivedChunks = []; // raw bytes as received, reassembled into the final WAV blob
        let headerBytes = new Uint8Array(0);
        let wavInfo = null; // { numChannels, sampleRate, bitsPerSample, dataOffset }
        let pendingPcm = new Uint8Array(0); // undecoded leftover bytes (partial sample frame)
        let filenameFromServer = 'generated_audio.wav'; // hoisted so the AbortError branch can use it too

        function scheduleChunk(pcmBytes) {
            if (wavInfo.bitsPerSample !== 16) {
                // Server only ever emits 16-bit PCM for streaming, but don't silently misdecode
                // if that ever changes — the bytes are still accumulated for the final blob.
                console.warn(`[stream] Unsupported bitsPerSample=${wavInfo.bitsPerSample}; skipping live playback for this chunk.`);
                return;
            }
            const float32 = pcm16BytesToFloat32(pcmBytes);
            const frameCount = Math.floor(float32.length / wavInfo.numChannels);
            if (frameCount <= 0) return;
            const buffer = audioCtx.createBuffer(wavInfo.numChannels, frameCount, wavInfo.sampleRate);
            for (let ch = 0; ch < wavInfo.numChannels; ch++) {
                const channelData = buffer.getChannelData(ch);
                if (wavInfo.numChannels === 1) {
                    channelData.set(float32.subarray(0, frameCount));
                } else {
                    for (let i = 0; i < frameCount; i++) channelData[i] = float32[i * wavInfo.numChannels + ch];
                }
            }
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            const startAt = Math.max(nextStartTime, audioCtx.currentTime);
            source.start(startAt);
            nextStartTime = startAt + buffer.duration;
            streamScheduledSources.push(source);
            if (!firstChunkLogged) {
                firstChunkLogged = true;
                console.log(`[stream] first chunk scheduled at +${(performance.now() - startTime).toFixed(1)}ms`);
                // Audio is playing now — the blocking modal has done its job. Hand off to the
                // inline "Streaming — playing" indicator instead of leaving the user locked out
                // for the rest of the stream.
                hideLoadingOverlay();
                showStreamIndicator();
            }
        }

        try {
            const response = await fetch(`${API_BASE_URL}/tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jsonData),
                signal: controller.signal
            });
            if (!response.ok) {
                const errorResult = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
                throw new Error(formatErrorDetail(errorResult.detail) || 'TTS generation failed.');
            }
            if (!response.body) {
                throw new Error('This browser does not support streaming responses.');
            }
            filenameFromServer = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || filenameFromServer;

            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (value && value.length) {
                    receivedChunks.push(value);
                    if (!wavInfo) {
                        headerBytes = concatBytes(headerBytes, value);
                        const parsed = parseWavHeader(headerBytes);
                        if (parsed) {
                            wavInfo = parsed;
                            pendingPcm = headerBytes.subarray(parsed.dataOffset);
                        }
                    } else {
                        pendingPcm = concatBytes(pendingPcm, value);
                    }

                    if (wavInfo) {
                        const alignBytes = wavInfo.numChannels * (wavInfo.bitsPerSample / 8);
                        const usableLen = pendingPcm.length - (pendingPcm.length % alignBytes);
                        if (usableLen > 0) {
                            scheduleChunk(pendingPcm.subarray(0, usableLen));
                            pendingPcm = pendingPcm.slice(usableLen);
                        }
                    }
                }
                if (done) break;
            }
            // Flush any final partial frame (shouldn't normally happen; PCM is sample-aligned).
            if (wavInfo && pendingPcm.length >= wavInfo.numChannels * (wavInfo.bitsPerSample / 8)) {
                scheduleChunk(pendingPcm);
            }

            console.log(`[stream] stream complete at +${(performance.now() - startTime).toFixed(1)}ms`);
            const genTime = ((performance.now() - startTime) / 1000).toFixed(2);

            // Hand the fully-assembled audio to WaveSurfer exactly like the non-streaming path,
            // so the waveform, seeking, and the download link all work the same afterwards.
            // scrollToPlayer=false: the indicator already scrolled into view when playback
            // started, and yanking the scroll again here — mid-playback, possibly mid-typing —
            // is exactly what D6 says not to do. WaveSurfer itself does not autoplay (see
            // initializeWaveSurfer), so this handoff does not double up on the still-sounding
            // scheduled buffers.
            const audioBlob = new Blob(receivedChunks, { type: 'audio/wav' });
            const resultDetails = {
                outputUrl: URL.createObjectURL(audioBlob), filename: filenameFromServer, genTime: genTime,
                submittedVoiceMode: jsonData.voice_mode, submittedPredefinedVoice: jsonData.predefined_voice_id,
                submittedCloneFile: jsonData.reference_audio_filename
            };
            initializeWaveSurfer(resultDetails.outputUrl, resultDetails, false);
            showNotification('Audio generated successfully!', 'success');

            // The fetch is done, but scheduled buffers may still be playing (fast servers can
            // finish sending well before real-time playback catches up). Keep the "Streaming —
            // playing" indicator up, and isGenerating true, until the last one actually ends.
            attachStreamCompletionHandler();
        } catch (error) {
            if (error.name === 'AbortError') {
                // Cancelled by the user — stopStreamingGeneration() already stopped playback
                // and reset the UI. Whatever audio arrived before the abort is still worth
                // keeping: load it into WaveSurfer (not autoplaying) so it can be replayed.
                if (receivedChunks.length) {
                    const audioBlob = new Blob(receivedChunks, { type: 'audio/wav' });
                    const resultDetails = {
                        outputUrl: URL.createObjectURL(audioBlob), filename: filenameFromServer,
                        genTime: ((performance.now() - startTime) / 1000).toFixed(2),
                        submittedVoiceMode: jsonData.voice_mode, submittedPredefinedVoice: jsonData.predefined_voice_id,
                        submittedCloneFile: jsonData.reference_audio_filename
                    };
                    initializeWaveSurfer(resultDetails.outputUrl, resultDetails, false);
                }
                return;
            }
            console.error('Streaming TTS Generation Error:', error);
            showNotification(error.message || 'An unknown error occurred during TTS generation.', 'error');
            finishStreamingPlayback();
        } finally {
            currentAbortController = null;
            hideLoadingOverlay();
        }
    }

    // Creates (or resumes) the shared streaming AudioContext. Must be called synchronously
    // from within a user-gesture click handler — browsers only allow an AudioContext to start
    // producing sound if it was created/resumed during a user gesture, and that permission does
    // not survive an `await`. proceedWithSubmissionChecks() is always invoked directly from a
    // click listener (the Generate button, or a warning modal's confirm button), so calling this
    // as its first line keeps it inside that gesture.
    function ensureStreamAudioContext() {
        if (!streamToggle || !streamToggle.checked) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return; // No AudioContext support — submitTTSRequest() falls back to non-streaming.
        if (!streamAudioContext || streamAudioContext.state === 'closed') {
            streamAudioContext = new AudioContextClass();
        }
        if (streamAudioContext.state === 'suspended') {
            streamAudioContext.resume().catch(() => {});
        }
    }

    function proceedWithSubmissionChecks() {
        ensureStreamAudioContext();
        const textContent = textArea.value.trim();
        const isSplittingEnabled = splitTextToggle.checked;
        const currentChunkSz = parseInt(chunkSizeSlider.value, 10);
        const needsChunkWarn = isSplittingEnabled && textContent.length >= currentChunkSz * 1.5 &&
            currentVoiceMode !== 'predefined' && currentVoiceMode !== 'clone' &&
            (!seedInput || parseInt(seedInput.value, 10) === 0 || seedInput.value === '') && !hideChunkWarning;
        if (needsChunkWarn) { showChunkWarningModal(); return; }
        submitTTSRequest();
    }

    // --- Attach main generation event to the button's CLICK, not the form's SUBMIT ---
    // This is a more robust method that prevents accidental submissions during page load.
    if (generateBtn) {
        generateBtn.addEventListener('click', function (event) {

            console.log('Generate button clicked!');
            console.log('Current voice mode:', currentVoiceMode);
            console.log('Is generating:', isGenerating);
            console.log('Text content:', textArea ? textArea.value.trim() : 'NO TEXTAREA');

            // We still prevent default in case the button has any default browser actions.
            event.preventDefault();

            if (isGenerating) {
                showNotification("Generation is already in progress.", "warning");
                return;
            }
            const textContent = textArea.value.trim();
            if (!textContent) {
                showNotification("Please enter some text to generate speech.", 'error');
                return;
            }
            if (currentVoiceMode === 'predefined' && (!predefinedVoiceSelect || predefinedVoiceSelect.value === 'none')) {
                showNotification("Please select a predefined voice.", 'error');
                return;
            }
            if (currentVoiceMode === 'clone' && (!cloneReferenceSelect || cloneReferenceSelect.value === 'none')) {
                showNotification("Please select a reference audio file for Voice Cloning.", 'error');
                return;
            }

            // Check for the generation quality warning.
            if (!hideGenerationWarning) {
                showGenerationWarningModal();
                return; // Stop here and let the modal handler take over.
            }

            // If the warning is hidden, proceed to the final checks.
            proceedWithSubmissionChecks();
        });
    } else {
        console.log('Generate button not found!');
    }

    // --- Modal Handling ---
    function showChunkWarningModal() {
        if (chunkWarningModal) {
            chunkWarningModal.style.display = 'flex';
            chunkWarningModal.classList.remove('hidden', 'opacity-0');
            chunkWarningModal.dataset.state = 'open';
        }
    }
    function hideChunkWarningModal() {
        if (chunkWarningModal) {
            chunkWarningModal.classList.add('opacity-0');
            setTimeout(() => {
                chunkWarningModal.style.display = 'none';
                chunkWarningModal.dataset.state = 'closed';
            }, 300);
        }
    }
    function showGenerationWarningModal() {
        if (generationWarningModal) {
            generationWarningModal.style.display = 'flex';
            generationWarningModal.classList.remove('hidden', 'opacity-0');
            generationWarningModal.dataset.state = 'open';
        }
    }
    function hideGenerationWarningModal() {
        if (generationWarningModal) {
            generationWarningModal.classList.add('opacity-0');
            setTimeout(() => {
                generationWarningModal.style.display = 'none';
                generationWarningModal.dataset.state = 'closed';
            }, 300);
        }
    }
    if (chunkWarningOkBtn) chunkWarningOkBtn.addEventListener('click', () => {
        if (hideChunkWarningCheckbox && hideChunkWarningCheckbox.checked) hideChunkWarning = true;
        hideChunkWarningModal(); debouncedSaveState(); submitTTSRequest();
    });
    if (chunkWarningCancelBtn) chunkWarningCancelBtn.addEventListener('click', hideChunkWarningModal);
    if (generationWarningAcknowledgeBtn) generationWarningAcknowledgeBtn.addEventListener('click', () => {
        if (hideGenerationWarningCheckbox && hideGenerationWarningCheckbox.checked) hideGenerationWarning = true;
        hideGenerationWarningModal(); debouncedSaveState(); proceedWithSubmissionChecks();
    });
    if (loadingCancelBtn) loadingCancelBtn.addEventListener('click', () => {
        if (isGenerating) {
            // Stops after the chunk currently being generated finishes — that one can't be
            // interrupted server-side. stopStreamingGeneration() aborts whichever request
            // (streaming or not) is actually in flight.
            stopStreamingGeneration("Cancelling — current chunk will still finish.");
        }
    });
    if (streamStopBtn) streamStopBtn.addEventListener('click', () => {
        stopStreamingGeneration("Stopping — current chunk will still finish.");
    });
    function showLoadingOverlay(isStreaming = false) {
        if (loadingOverlay && generateBtn && loadingCancelBtn) {
            loadingMessage.textContent = 'Generating audio...';
            loadingStatusText.textContent = isStreaming
                ? 'Audio will begin playing as soon as the first chunk is ready.'
                : 'Please wait. This may take some time.';
            loadingOverlay.style.display = 'flex';
            loadingOverlay.classList.remove('hidden', 'opacity-0'); loadingOverlay.dataset.state = 'open';
            generateBtn.disabled = true; loadingCancelBtn.disabled = false;
        }
    }
    function hideLoadingOverlay() {
        if (loadingOverlay && generateBtn) {
            loadingOverlay.classList.add('opacity-0');
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
                loadingOverlay.dataset.state = 'closed';
            }, 300);
            generateBtn.disabled = false;
        }
    }

    // --- Configuration Management ---
    function displayServerConfiguration() {
        if (!serverConfigForm || !currentConfig || Object.keys(currentConfig).length === 0) return;
        const fieldsToDisplay = {
            "server.host": currentConfig.server?.host, "server.port": currentConfig.server?.port,
            "tts_engine.device": currentConfig.tts_engine?.device, "tts_engine.default_voice_id": currentConfig.tts_engine?.default_voice_id,
            "paths.model_cache": currentConfig.paths?.model_cache, "tts_engine.predefined_voices_path": currentConfig.tts_engine?.predefined_voices_path,
            "tts_engine.reference_audio_path": currentConfig.tts_engine?.reference_audio_path, "paths.output": currentConfig.paths?.output,
            "audio_output.format": currentConfig.audio_output?.format, "audio_output.sample_rate": currentConfig.audio_output?.sample_rate
        };
        const checkboxFields = {
            "audio_output.save_to_disk": currentConfig.audio_output?.save_to_disk
        };
        for (const name in fieldsToDisplay) {
            // Match both <input> and <select> — tts_engine.device and audio_output.format are
            // <select> elements, the rest are <input>.
            const input = serverConfigForm.querySelector(`[name="${name}"]`);
            if (input) {
                input.value = fieldsToDisplay[name] !== undefined ? fieldsToDisplay[name] : '';
                if (name.includes('.host') || name.includes('.port') || name.includes('paths.')) input.readOnly = true;
                else input.readOnly = false;
            }
        }
        for (const name in checkboxFields) {
            const input = serverConfigForm.querySelector(`input[name="${name}"]`);
            if (input) input.checked = !!checkboxFields[name];
        }
    }
    async function updateConfigStatus(button, statusElem, message, type = 'info', duration = 5000, enableButtonAfter = true) {
        const statusClasses = { success: 'text-green-600 dark:text-green-400', error: 'text-red-600 dark:text-red-400', warning: 'text-yellow-600 dark:text-yellow-400', info: 'text-indigo-600 dark:text-indigo-400', processing: 'text-yellow-600 dark:text-yellow-400 animate-pulse' };
        const isProcessing = message.toLowerCase().includes('saving') || message.toLowerCase().includes('restarting') || message.toLowerCase().includes('resetting');
        const messageType = isProcessing ? 'processing' : type;
        if (statusElem) {
            statusElem.textContent = message;
            statusElem.className = `text-xs ml-2 ${statusClasses[messageType] || statusClasses['info']}`;
            statusElem.classList.remove('hidden');
        }
        if (button) button.disabled = isProcessing || (type === 'error' && !enableButtonAfter) || (type === 'success' && !enableButtonAfter);
        if (duration > 0) setTimeout(() => { if (statusElem) statusElem.classList.add('hidden'); if (button && enableButtonAfter) button.disabled = false; }, duration);
        else if (button && enableButtonAfter && !isProcessing) button.disabled = false;
    }

    /**
     * Wait for the server to come back after a restart, then reload the page.
     *
     * /api/model-info only answers once startup has finished (it is served after the
     * lifespan handler, which loads the model), so a successful response is an exact
     * "back online" signal rather than a guess. Polling it means the user gets a real
     * confirmation instead of being told to refresh manually and left with a button
     * stuck in its processing state.
     *
     * @param {HTMLElement|null} button   control to re-enable if the wait fails
     * @param {HTMLElement|null} statusEl element to report progress in
     * @returns {Promise<boolean>} true if the server came back (page is reloading)
     */
    async function waitForServerRestart(button, statusEl) {
        const startedAt = Date.now();
        const timeoutMs = 180000;   // model load alone can take ~45s; be generous
        const intervalMs = 2000;
        // Give the process a moment to actually go down, so we don't get a response
        // from the server we just asked to stop and declare success immediately.
        await new Promise((r) => setTimeout(r, 3000));

        while (Date.now() - startedAt < timeoutMs) {
            try {
                const res = await fetch(`${API_BASE_URL}/api/model-info`, { cache: 'no-store' });
                if (res.ok) {
                    updateConfigStatus(button, statusEl, 'Server back online. Reloading...', 'success', 0, false);
                    showNotification('Server restarted successfully. Reloading the page...', 'success', 4000);
                    setTimeout(() => window.location.reload(), 800);
                    return true;
                }
            } catch (e) {
                // Expected while the server is down - keep waiting.
            }
            const secs = Math.round((Date.now() - startedAt) / 1000);
            updateConfigStatus(button, statusEl, `Restarting server... (${secs}s)`, 'processing', 0, false);
            await new Promise((r) => setTimeout(r, intervalMs));
        }

        updateConfigStatus(button, statusEl, 'Server did not come back in time - reload manually.', 'error', 0, true);
        showNotification('The server did not respond after restarting. Check its console, then reload this page.', 'error', 0);
        if (button) button.disabled = false;
        return false;
    }

    if (saveConfigBtn && configStatus) {
        saveConfigBtn.addEventListener('click', async () => {
            const configDataToSave = {};
            const inputs = serverConfigForm.querySelectorAll('input[name]:not([readonly]), select[name]:not([readonly])');
            inputs.forEach(input => {
                const keys = input.name.split('.'); let currentLevel = configDataToSave;
                keys.forEach((key, index) => {
                    if (index === keys.length - 1) {
                        let value = input.value;
                        if (input.type === 'number') value = parseFloat(value) || 0;
                        else if (input.type === 'checkbox') value = input.checked;
                        currentLevel[key] = value;
                    } else { currentLevel[key] = currentLevel[key] || {}; currentLevel = currentLevel[key]; }
                });
            });
            if (Object.keys(configDataToSave).length === 0) { showNotification("No editable configuration values to save.", "info"); return; }
            updateConfigStatus(saveConfigBtn, configStatus, 'Saving configuration...', 'info', 0, false);
            try {
                const response = await fetch(`${API_BASE_URL}/save_settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(configDataToSave)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.detail || 'Failed to save configuration');
                updateConfigStatus(saveConfigBtn, configStatus, result.message || 'Configuration saved.', 'success', 5000);
                if (result.restart_needed && restartServerBtn) restartServerBtn.classList.remove('hidden');
                await fetchInitialData();
                showNotification("Configuration saved. Some changes may require a server restart if prompted.", "success");
            } catch (error) {
                console.error('Error saving server config:', error);
                updateConfigStatus(saveConfigBtn, configStatus, `Error: ${error.message}`, 'error', 0);
            }
        });
    }

    if (saveGenDefaultsBtn && genDefaultsStatus) {
        saveGenDefaultsBtn.addEventListener('click', async () => {
            const genParams = {
                temperature: parseFloat(temperatureSlider.value), exaggeration: parseFloat(exaggerationSlider.value),
                cfg_weight: parseFloat(cfgWeightSlider.value), speed_factor: parseFloat(speedFactorSlider.value),
                seed: parseInt(seedInput.value, 10) || 0, language: languageSelect.value
            };
            updateConfigStatus(saveGenDefaultsBtn, genDefaultsStatus, 'Saving generation defaults...', 'info', 0, false);
            try {
                const response = await fetch(`${API_BASE_URL}/save_settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ generation_defaults: genParams })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.detail || 'Failed to save generation defaults');
                updateConfigStatus(saveGenDefaultsBtn, genDefaultsStatus, result.message || 'Generation defaults saved.', 'success', 5000);
                if (currentConfig.generation_defaults) Object.assign(currentConfig.generation_defaults, genParams);
            } catch (error) {
                console.error('Error saving generation defaults:', error);
                updateConfigStatus(saveGenDefaultsBtn, genDefaultsStatus, `Error: ${error.message}`, 'error', 0);
            }
        });
    }

    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to reset ALL settings to their initial defaults? This will affect config.yaml and UI preferences. This action cannot be undone.")) return;
            updateConfigStatus(resetSettingsBtn, configStatus, 'Resetting settings...', 'info', 0, false);
            try {
                const response = await fetch(`${API_BASE_URL}/reset_settings`, {
                    method: 'POST'
                });
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({ detail: 'Failed to reset settings on server.' }));
                    throw new Error(formatErrorDetail(errorResult.detail));
                }
                const result = await response.json();
                updateConfigStatus(resetSettingsBtn, configStatus, result.message + " Reloading page...", 'success', 0, false);
                setTimeout(() => window.location.reload(true), 2000);
            } catch (error) {
                console.error('Error resetting settings:', error);
                updateConfigStatus(resetSettingsBtn, configStatus, `Reset Error: ${error.message}`, 'error', 0);
                showNotification(`Error resetting settings: ${error.message}`, 'error');
            }
        });
    }

    if (restartServerBtn) {
        restartServerBtn.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to restart the server?")) return;
            updateConfigStatus(restartServerBtn, configStatus, 'Attempting server restart...', 'processing', 0, false);
            try {
                const response = await fetch(`${API_BASE_URL}/restart_server`, {
                    method: 'POST'
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.detail || 'Server responded with error on restart command');
                showNotification("Server restart initiated. Waiting for it to come back online...", "info", 6000);
                // Poll until it answers, then reload. Without this the status stays stuck on
                // 'Attempting server restart...' and the button stays disabled forever, because
                // only the catch branch below ever cleared them.
                await waitForServerRestart(restartServerBtn, configStatus);
            } catch (error) {
                showNotification(`Server restart command failed: ${error.message}`, "error");
                updateConfigStatus(restartServerBtn, configStatus, `Restart failed.`, 'error', 5000, true);
            }
        });
    }

    // --- File Upload & Refresh ---
    async function handleFileUpload(fileInput, endpoint, successCallback, buttonToAnimate) {
        const files = fileInput.files;
        if (!files || files.length === 0) return;
        const originalButtonHTML = buttonToAnimate ? buttonToAnimate.innerHTML : '';
        if (buttonToAnimate) {
            buttonToAnimate.innerHTML = `<svg class="animate-spin h-5 w-5 mr-1.5 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Uploading...`;
            buttonToAnimate.disabled = true;
        }
        const uploadNotification = showNotification(`Uploading ${files.length} file(s)...`, 'info', 0);
        const formData = new FormData();
        for (const file of files) formData.append('files', file);
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (uploadNotification) uploadNotification.remove();
            if (!response.ok) throw new Error(result.message || result.detail || `Upload failed with status ${response.status}`);
            if (result.errors && result.errors.length > 0) {
                result.errors.forEach(err => showNotification(`Upload Warning: ${err.filename || 'File'} - ${err.error}`, 'warning', 10000));
            }
            const successfulUploads = result.uploaded_files || [];
            if (successfulUploads.length > 0) {
                showNotification(`Successfully uploaded: ${successfulUploads.join(', ')}`, 'success');
            } else if (!result.errors || result.errors.length === 0) {
                showNotification("Files processed. No new valid files were added or an issue occurred.", 'info');
            }
            successCallback(result);
            debouncedSaveState();
        } catch (error) {
            console.error(`Error uploading to ${endpoint}:`, error);
            if (uploadNotification) uploadNotification.remove();
            showNotification(`Upload Error: ${error.message}`, 'error');
        } finally {
            if (buttonToAnimate) {
                buttonToAnimate.disabled = false;
                buttonToAnimate.innerHTML = originalButtonHTML;
            }
            fileInput.value = '';
        }
    }

    if (cloneImportButton && cloneFileInput) {
        cloneImportButton.addEventListener('click', () => cloneFileInput.click());
        cloneFileInput.addEventListener('change', () => handleFileUpload(cloneFileInput, '/upload_reference', (result) => {
            initialReferenceFiles = result.all_reference_files || [];
            populateReferenceFiles();
            const firstUploaded = result.uploaded_files?.[0];
            if (firstUploaded && cloneReferenceSelect && Array.from(cloneReferenceSelect.options).some(opt => opt.value === firstUploaded)) {
                cloneReferenceSelect.value = firstUploaded;
            }
        }, cloneImportButton));
    }

    if (predefinedVoiceImportButton && predefinedVoiceFileInput) {
        predefinedVoiceImportButton.addEventListener('click', () => predefinedVoiceFileInput.click());
        predefinedVoiceFileInput.addEventListener('change', () => handleFileUpload(predefinedVoiceFileInput, '/upload_predefined_voice', (result) => {
            initialPredefinedVoices = result.all_predefined_voices || [];
            populatePredefinedVoices();
            const firstUploadedFilename = result.uploaded_files?.[0];
            if (firstUploadedFilename && predefinedVoiceSelect && initialPredefinedVoices.some(v => v.filename === firstUploadedFilename)) {
                predefinedVoiceSelect.value = firstUploadedFilename;
            }
        }, predefinedVoiceImportButton));
    }

    if (cloneRefreshButton && cloneReferenceSelect) {
        cloneRefreshButton.addEventListener('click', async () => {
            const originalButtonIcon = cloneRefreshButton.innerHTML;
            cloneRefreshButton.innerHTML = `<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
            cloneRefreshButton.disabled = true;
            try {
                const response = await fetch(`${API_BASE_URL}/get_reference_files`);
                if (!response.ok) throw new Error('Failed to fetch reference files list');
                const files = await response.json();
                initialReferenceFiles = files;
                populateReferenceFiles();
                showNotification("Reference file list refreshed.", 'info', 2000);
                debouncedSaveState();
            } catch (error) {
                console.error("Error refreshing reference files:", error);
                showNotification(`Error refreshing list: ${error.message}`, 'error');
            } finally {
                cloneRefreshButton.disabled = false;
                cloneRefreshButton.innerHTML = originalButtonIcon;
            }
        });
    }

    if (predefinedVoiceRefreshButton && predefinedVoiceSelect) {
        predefinedVoiceRefreshButton.addEventListener('click', async () => {
            const originalButtonIcon = predefinedVoiceRefreshButton.innerHTML;
            predefinedVoiceRefreshButton.innerHTML = `<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
            predefinedVoiceRefreshButton.disabled = true;
            try {
                const response = await fetch(`${API_BASE_URL}/get_predefined_voices`);
                if (!response.ok) throw new Error('Failed to fetch predefined voices list');
                const voices = await response.json();
                initialPredefinedVoices = voices;
                populatePredefinedVoices();
                showNotification("Predefined voices list refreshed.", 'info', 2000);
                debouncedSaveState();
            } catch (error) {
                console.error("Error refreshing predefined voices:", error);
                showNotification(`Error refreshing list: ${error.message}`, 'error');
            } finally {
                predefinedVoiceRefreshButton.disabled = false;
                predefinedVoiceRefreshButton.innerHTML = originalButtonIcon;
            }
        });
    }

    // Call fetchInitialData at the end of setup to kick everything off.
    // Note: This calls initializeApplication internally.
    await fetchInitialData();
});
