# FreeScribe Copilot

FreeScribe Copilot is a Chrome and Firefox extension designed to assist healthcare providers in real-time transcription and note-taking during patient interactions. The tool helps automate note generation using AI, providing structured SOAP (Subjective, Objective, Assessment, Plan) notes from conversation data, improving efficiency and accuracy in healthcare documentation.

## Features

- **Local Transcription**  
  *Use a local transcription service by toggling the 'Use Local Transcription' option.*

- **Local Language Model (LLM)**  
  *Run an LLM container locally by enabling 'Use Local LLM' for more secure and private processing.*

- **Real-time Processing**  
  *Capture audio in real-time and process it instantly with configurable recording length and silence detection.*

- **Word Count Settings**  
  *Enforce a minimum word count whenever needed by enabling the 'Minimum Word Count Check' and setting a limit.*

- **Pre- and Post-Processing**  
  *Customize prompts for both pre and post processing to fine-tune the final output.*

- **Translation into English**  
  *Automatically translate local transcription output into English for consistent documentation.*

- **Configuration**  
  *Adjust settings like debug mode, server URLs, API keys, and more from the dedicated options page.*


## Prerequisites

If you plan to use remote transcription or a remote LLM, the following components are required:

- **Freescribe Client**: [FreeScribe](https://github.com/ClinicianFOCUS/FreeScribe)
- **Local LLM Container**: [Local LLM Container](https://github.com/ClinicianFOCUS/local-llm-container)
- **Speech to Text Converter**: [Speech2Text Container](https://github.com/ClinicianFOCUS/speech2text-container)

If you use local features for these tasks, you can skip the above prerequisites.

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

- **Transcription Settings**: Configure local or remote transcription, specify server URLs, and set API keys.
- **Language Model Settings**: Choose between local or remote LLMs, define models, and customize prompts for generating SOAP notes.
- **Real-time Processing**: Enable real-time recording, set silence thresholds, and adjust recording lengths.
- **Word Count Settings**: Enforce a minimum word count when needed.
- **Pre- and Post-Processing**: Apply custom prompts before and after generating the final output.
- **Translation**: Automatically translate local transcription output into English.
- **Logging**: Enable debug mode to capture detailed logs.

To access the options page:

1. Click the FreeScribe icon in the browser toolbar.
2. Choose "Options" to configure your settings.

## License

This project is licensed under the AGPL-3.0 License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests on GitHub.
