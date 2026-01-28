import React, { useState, useEffect, useRef } from 'react';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import './VoiceInput.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const VoiceInput = ({ onTranscript, language, disabled }) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const recognizerRef = useRef(null);
  const audioConfigRef = useRef(null);
  const speechConfigRef = useRef(null);

  // Map language codes to Azure Speech locale
  const getLocale = (lang) => {
    switch (lang) {
      case 'zh-HK':
        return 'zh-HK';
      case 'zh-CN':
        return 'zh-CN';
      default:
        return 'en-US';
    }
  };

  // Get Azure Speech token from backend
  const getToken = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/speech/token`);
      if (!response.ok) {
        throw new Error('Failed to get speech token');
      }
      const data = await response.json();
      return { token: data.token, region: data.region };
    } catch (err) {
      console.error('Error getting token:', err);
      throw err;
    }
  };

  // Initialize speech recognizer
  const initializeRecognizer = async () => {
    try {
      const { token, region } = await getToken();
      const locale = getLocale(language);

      // Create speech config with token
      const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region);
      speechConfig.speechRecognitionLanguage = locale;

      // Create audio config (use default microphone)
      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();

      // Create recognizer
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      // Set up event handlers
      recognizer.recognizing = (s, e) => {
        // Intermediate results
        if (e.result.text) {
          setIsProcessing(true);
        }
      };

      recognizer.recognized = (s, e) => {
        setIsProcessing(false);
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          const transcript = e.result.text;
          if (transcript && transcript.trim()) {
            onTranscript(transcript);
          }
        } else if (e.result.reason === sdk.ResultReason.NoMatch) {
          setError('No speech detected. Please try again.');
        }
      };

      recognizer.canceled = (s, e) => {
        setIsListening(false);
        setIsProcessing(false);
        if (e.reason === sdk.CancellationReason.Error) {
          setError(`Speech recognition error: ${e.errorDetails}`);
          console.error('Speech recognition error:', e.errorDetails);
        }
      };

      recognizer.sessionStopped = (s, e) => {
        setIsListening(false);
        setIsProcessing(false);
        recognizer.stopContinuousRecognitionAsync();
      };

      return { recognizer, audioConfig, speechConfig };
    } catch (err) {
      console.error('Error initializing recognizer:', err);
      setError('Failed to initialize speech recognition. Please check your microphone permissions.');
      throw err;
    }
  };

  // Start listening
  const startListening = async () => {
    if (disabled || isListening) return;

    try {
      setError(null);
      setIsListening(true);
      setIsProcessing(false);

      const { recognizer, audioConfig, speechConfig } = await initializeRecognizer();

      recognizerRef.current = recognizer;
      audioConfigRef.current = audioConfig;
      speechConfigRef.current = speechConfig;

      await recognizer.startContinuousRecognitionAsync();
    } catch (err) {
      console.error('Error starting recognition:', err);
      setError('Failed to start voice input. Please check your microphone permissions.');
      setIsListening(false);
      setIsProcessing(false);
    }
  };

  // Stop listening
  const stopListening = async () => {
    if (!isListening) return;

    try {
      if (recognizerRef.current) {
        await recognizerRef.current.stopContinuousRecognitionAsync();
        recognizerRef.current.close();
        recognizerRef.current = null;
      }
      if (audioConfigRef.current) {
        audioConfigRef.current.close();
        audioConfigRef.current = null;
      }
      if (speechConfigRef.current) {
        speechConfigRef.current.close();
        speechConfigRef.current = null;
      }
      setIsListening(false);
      setIsProcessing(false);
    } catch (err) {
      console.error('Error stopping recognition:', err);
    }
  };

  // Toggle listening
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognizerRef.current) {
        recognizerRef.current.stopContinuousRecognitionAsync();
        recognizerRef.current.close();
      }
      if (audioConfigRef.current) {
        audioConfigRef.current.close();
      }
      if (speechConfigRef.current) {
        speechConfigRef.current.close();
      }
    };
  }, []);

  // Update locale when language changes
  useEffect(() => {
    if (isListening && speechConfigRef.current) {
      const locale = getLocale(language);
      speechConfigRef.current.speechRecognitionLanguage = locale;
    }
  }, [language, isListening]);

  return (
    <div className="voice-input-container">
      <button
        type="button"
        className={`voice-input-button ${isListening ? 'listening' : ''} ${isProcessing ? 'processing' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={toggleListening}
        disabled={disabled}
        aria-label={isListening ? 'Stop listening' : 'Start voice input'}
        title={
          isListening
            ? language === 'en'
              ? 'Click to stop listening'
              : language === 'zh-HK'
                ? '點擊停止聆聽'
                : '点击停止聆听'
            : language === 'en'
              ? 'Click to start voice input'
              : language === 'zh-HK'
                ? '點擊開始語音輸入'
                : '点击开始语音输入'
        }
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
        </svg>
        {isProcessing && (
          <div className="voice-processing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
      </button>
      {error && (
        <div className="voice-input-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceInput;

