/** Error whose `exitCode` maps to the CLI exit codes: 2 usage/config, 3 environment. */
export class VuiError extends Error {
  readonly exitCode: 2 | 3;
  constructor(message: string, exitCode: 2 | 3) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class UsageError extends VuiError {
  constructor(message: string) {
    super(message, 2);
  }
}

export class ConfigError extends VuiError {
  constructor(message: string) {
    super(message, 2);
  }
}

export class ReactNotFound extends VuiError {
  constructor(hostRoot: string) {
    super(
      `Could not resolve "react" from ${hostRoot}. vui renders with the host project's own React; install react and react-dom there.`,
      3,
    );
  }
}

/** The page could not be loaded at all: refused, DNS, TLS, timeout, or a blocked redirect. */
export class NavigationError extends VuiError {
  constructor(message: string) {
    super(message, 2);
  }
}

export class BrowserNotFound extends VuiError {
  constructor() {
    super("No Chrome found. Run: vui install-browser", 3);
  }
}
