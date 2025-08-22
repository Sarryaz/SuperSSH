/**
 * Utility class for logging SSH operations
 */
export class LoggingUtils {
	/**
	 * Log a message if verbose logging is enabled
	 */
	static log(message: string, verboseLogging: boolean): void {
		if (verboseLogging) {
			console.log(`[SuperSSH] ${message}`);
		}
	}

	/**
	 * Log an error if verbose logging is enabled
	 */
	static error(message: string, verboseLogging: boolean): void {
		if (verboseLogging) {
			console.error(`[SuperSSH] ${message}`);
		}
	}

	/**
	 * Log debug information with buffer analysis
	 */
	static debug(message: string, data?: any, verboseLogging?: boolean): void {
		if (verboseLogging) {
			if (data !== undefined) {
				console.debug(`[SuperSSH DEBUG] ${message}`, data);
			} else {
				console.debug(`[SuperSSH DEBUG] ${message}`);
			}
		}
	}

	/**
	 * Analyze and log buffer contents for debugging
	 */
	static analyzeBuffer(buffer: string, verboseLogging: boolean): void {
		if (!verboseLogging) return;

		console.log(`[SuperSSH] Buffer Analysis:`);
		console.log(`  Length: ${buffer.length}`);
		
		if (buffer.length > 0) {
			// Log the buffer as a string
			const displayBuffer = buffer.length > 200 
				? `${buffer.substring(0, 100)}...${buffer.substring(buffer.length - 100)}`
				: buffer;
			console.log(`  Content: "${displayBuffer}"`);
			
			// Show buffer as hex to check for invisible characters
			const hexView = Buffer.from(buffer)
				.toString('hex')
				.match(/.{1,2}/g)
				?.join(' ') || '';
			const displayHex = hexView.length > 200 
				? `${hexView.substring(0, 100)}...${hexView.substring(hexView.length - 100)}`
				: hexView;
			console.log(`  Hex: ${displayHex}`);
		} else {
			console.log(`  Buffer is empty`);
		}
	}
}
