# FreeScribe Copilot

FreeScribe Copilot is a Chrome and Firefox extension designed to assist healthcare providers in real-time transcription and note-taking during patient interactions. The tool helps automate note generation using AI, providing structured SOAP (Subjective, Objective, Assessment, Plan) notes from conversation data, improving efficiency and accuracy in healthcare documentation.

## Features

- **Real-time Audio Transcription**: Capture and transcribe audio from your microphone and active browser tab.
- **Automatic Note Generation**: Generate concise SOAP notes using an AI model trained for medical documentation.
- **Customizable Transcription and AI Settings**: Configure transcription server, API keys, and language model preferences.
- **Device Support**: Choose from multiple audio input devices for flexible recording.
- **Real-time Processing**: Option to enable or disable real-time audio processing and note generation based on silence detection.

## Prerequisites

This project requires the following components to be running before using the extension:

- **Freescribe Client**: [FreeScribe](https://github.com/ClinicianFOCUS/FreeScribe)
- **Local LLM Container**: [Local LLM Container](https://github.com/ClinicianFOCUS/local-llm-container)
- **Speech to Text Converter**: [Speech2Text Container](https://github.com/ClinicianFOCUS/speech2text-container)

Ensure these components are installed and started by following the instructions in their respective repositories.

## Build

### Prerequisites

- Node.js and npm installed

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/ClinicianFOCUS/freescribe-copilot.git
   cd freescribe-copilot
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

### Build for Production

To create a production build, run:

```bash
npm run prod
```

## Installation

### Chrome

1. Download or clone the repository.
2. Navigate to `chrome://extensions/`.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the `dist` folder from the project directory.

### Firefox

1. Download or clone the repository.
2. Navigate to `about:debugging`.
3. Click "This Firefox" and then "Load Temporary Add-on".
4. Select the `manifest.json` file from the project directory.

## Configuration

FreeScribe Copilot is customizable via the options page:

- **Transcription Settings**: Set the transcription server URL and API key.
- **Language Model Settings**: Define the AI model and prompts for generating SOAP notes.
- **Real-time Processing**: Configure silence detection thresholds and recording lengths for real-time processing.

To access the options page:

1. Click the FreeScribe icon in the browser toolbar.
2. Click on "Configuration" to configure your settings.

### Setting up server-based Transcription

1. Apply ths URL to the Transcription Server URL: https://localhost:2224/whisperaudio
2. Get the Transcription Server API Key from the docker container logs: `speech-container`. 
   ** make sure to get the latest API key

### Setting uup server-based LLM

1. Apply this URL to the LLM Server URL: https://localhost:3334/v1
2. Get the LLM Server API Key from the docker container logs: `authentication-ollama`
   ** make sure to get the latest API key

## License

This project is licensed under the AGPL-3.0 License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests on GitHub.