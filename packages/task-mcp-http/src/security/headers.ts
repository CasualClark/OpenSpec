/**
 * Security Headers Middleware for Task MCP HTTPS/SSE Server
 * 
 * Provides comprehensive security headers including CSP, HSTS, and other protections
 */

import { FastifyRequest, FastifyReply } from 'fastify';

export interface SecurityHeadersConfig {
  enabled: boolean;
  contentSecurityPolicy: {
    enabled: boolean;
    directives: {
      defaultSrc?: string[];
      scriptSrc?: string[];
      styleSrc?: string[];
      imgSrc?: string[];
      connectSrc?: string[];
      fontSrc?: string[];
      objectSrc?: string[];
      mediaSrc?: string[];
      frameSrc?: string[];
      childSrc?: string[];
      workerSrc?: string[];
      manifestSrc?: string[];
      upgradeInsecureRequests?: boolean;
      blockAllMixedContent?: boolean;
    };
  };
  strictTransportSecurity: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  frameOptions: {
    enabled: boolean;
    action: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
    origin?: string;
  };
  contentTypeOptions: {
    enabled: boolean;
    nosniff: boolean;
  };
  referrerPolicy: {
    enabled: boolean;
    policy: string;
  };
  permissionsPolicy: {
    enabled: boolean;
    features: { [feature: string]: string[] };
  };
  customHeaders: { [header: string]: string };
}

/**
 * Security headers middleware class
 */
export class SecurityHeadersMiddleware {
  private config: SecurityHeadersConfig;

  constructor(config?: Partial<SecurityHeadersConfig>) {
    this.config = this.createDefaultConfig(config);
  }

  /**
   * Create default security configuration
   */
  private createDefaultConfig(overrides?: Partial<SecurityHeadersConfig>): SecurityHeadersConfig {
    return {
      enabled: true,
      contentSecurityPolicy: {
        enabled: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          childSrc: ["'none'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          upgradeInsecureRequests: true,
          blockAllMixedContent: true
        }
      },
      strictTransportSecurity: {
        enabled: true,
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: false
      },
      frameOptions: {
        enabled: true,
        action: 'DENY'
      },
      contentTypeOptions: {
        enabled: true,
        nosniff: true
      },
      referrerPolicy: {
        enabled: true,
        policy: 'strict-origin-when-cross-origin'
      },
      permissionsPolicy: {
        enabled: true,
        features: {
          'geolocation': [],
          'microphone': [],
          'camera': [],
          'payment': [],
          'usb': [],
          'magnetometer': [],
          'gyroscope': [],
          'accelerometer': [],
          'ambient-light-sensor': [],
          'autoplay': [],
          'encrypted-media': [],
          'fullscreen': [],
          'picture-in-picture': []
        }
      },
      customHeaders: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'X-DNS-Prefetch-Control': 'off',
        'X-Download-Options': 'noopen',
        'X-Permitted-Cross-Domain-Policies': 'none',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin'
      },
      ...overrides
    };
  }

  /**
   * Security headers middleware
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!this.config.enabled) {
        return;
      }

      // Content Security Policy
      if (this.config.contentSecurityPolicy.enabled) {
        const csp = this.buildCSP();
        if (csp) {
          reply.header('Content-Security-Policy', csp);
        }
      }

      // Strict Transport Security (HTTPS only)
      if (this.config.strictTransportSecurity.enabled && this.isHttps(request)) {
        const hsts = this.buildHSTS();
        if (hsts) {
          reply.header('Strict-Transport-Security', hsts);
        }
      }

      // Frame Options
      if (this.config.frameOptions.enabled) {
        const frameOptions = this.buildFrameOptions();
        if (frameOptions) {
          reply.header('X-Frame-Options', frameOptions);
        }
      }

      // Content Type Options
      if (this.config.contentTypeOptions.enabled && this.config.contentTypeOptions.nosniff) {
        reply.header('X-Content-Type-Options', 'nosniff');
      }

      // Referrer Policy
      if (this.config.referrerPolicy.enabled) {
        reply.header('Referrer-Policy', this.config.referrerPolicy.policy);
      }

      // Permissions Policy
      if (this.config.permissionsPolicy.enabled) {
        const permissionsPolicy = this.buildPermissionsPolicy();
        if (permissionsPolicy) {
          reply.header('Permissions-Policy', permissionsPolicy);
        }
      }

      // Custom headers
      Object.entries(this.config.customHeaders).forEach(([header, value]) => {
        reply.header(header, value);
      });

      // Remove sensitive headers that might leak information
      this.removeSensitiveHeaders(reply);
    };
  }

  /**
   * Build Content Security Policy header
   */
  private buildCSP(): string {
    const directives: string[] = [];
    const { directives: config } = this.config.contentSecurityPolicy;

    const directiveMap: { [key: string]: string[] } = {
      'default-src': config.defaultSrc || [],
      'script-src': config.scriptSrc || [],
      'style-src': config.styleSrc || [],
      'img-src': config.imgSrc || [],
      'connect-src': config.connectSrc || [],
      'font-src': config.fontSrc || [],
      'object-src': config.objectSrc || [],
      'media-src': config.mediaSrc || [],
      'frame-src': config.frameSrc || [],
      'child-src': config.childSrc || [],
      'worker-src': config.workerSrc || [],
      'manifest-src': config.manifestSrc || []
    };

    Object.entries(directiveMap).forEach(([directive, values]) => {
      if (values.length > 0) {
        directives.push(`${directive} ${values.join(' ')}`);
      }
    });

    if (config.upgradeInsecureRequests) {
      directives.push('upgrade-insecure-requests');
    }

    if (config.blockAllMixedContent) {
      directives.push('block-all-mixed-content');
    }

    return directives.join('; ');
  }

  /**
   * Build Strict Transport Security header
   */
  private buildHSTS(): string {
    const { maxAge, includeSubDomains, preload } = this.config.strictTransportSecurity;
    const directives = [`max-age=${maxAge}`];

    if (includeSubDomains) {
      directives.push('includeSubDomains');
    }

    if (preload) {
      directives.push('preload');
    }

    return directives.join('; ');
  }

  /**
   * Build X-Frame-Options header
   */
  private buildFrameOptions(): string {
    const { action, origin } = this.config.frameOptions;
    
    if (action === 'ALLOW-FROM' && origin) {
      return `ALLOW-FROM ${origin}`;
    }
    
    return action;
  }

  /**
   * Build Permissions Policy header
   */
  private buildPermissionsPolicy(): string {
    const features: string[] = [];
    
    Object.entries(this.config.permissionsPolicy.features).forEach(([feature, values]) => {
      if (values.length === 0) {
        features.push(`${feature}=()`);
      } else {
        features.push(`${feature}=(${values.join(' ')})`);
      }
    });

    return features.join(', ');
  }

  /**
   * Check if request is HTTPS
   */
  private isHttps(request: FastifyRequest): boolean {
    return request.protocol === 'https' || 
           (request.headers['x-forwarded-proto'] === 'https');
  }

  /**
   * Remove sensitive headers that might leak information
   */
  private removeSensitiveHeaders(reply: FastifyReply): void {
    const sensitiveHeaders = [
      'x-powered-by',
      'server',
      'x-aspnet-version',
      'x-aspnetmvc-version',
      'x-generator'
    ];

    sensitiveHeaders.forEach(header => {
      reply.removeHeader(header);
    });
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SecurityHeadersConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
  }

  /**
   * Deep merge configuration objects
   */
  private mergeConfig(base: SecurityHeadersConfig, updates: Partial<SecurityHeadersConfig>): SecurityHeadersConfig {
    const merged = { ...base, ...updates };

    // Deep merge nested objects
    if (updates.contentSecurityPolicy) {
      merged.contentSecurityPolicy = {
        ...base.contentSecurityPolicy,
        ...updates.contentSecurityPolicy,
        directives: {
          ...base.contentSecurityPolicy.directives,
          ...updates.contentSecurityPolicy.directives
        }
      };
    }

    if (updates.strictTransportSecurity) {
      merged.strictTransportSecurity = {
        ...base.strictTransportSecurity,
        ...updates.strictTransportSecurity
      };
    }

    if (updates.frameOptions) {
      merged.frameOptions = {
        ...base.frameOptions,
        ...updates.frameOptions
      };
    }

    if (updates.contentTypeOptions) {
      merged.contentTypeOptions = {
        ...base.contentTypeOptions,
        ...updates.contentTypeOptions
      };
    }

    if (updates.referrerPolicy) {
      merged.referrerPolicy = {
        ...base.referrerPolicy,
        ...updates.referrerPolicy
      };
    }

    if (updates.permissionsPolicy) {
      merged.permissionsPolicy = {
        ...base.permissionsPolicy,
        ...updates.permissionsPolicy
      };
    }

    if (updates.customHeaders) {
      merged.customHeaders = {
        ...base.customHeaders,
        ...updates.customHeaders
      };
    }

    return merged;
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityHeadersConfig {
    return JSON.parse(JSON.stringify(this.config)); // Deep clone
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.strictTransportSecurity.enabled && this.config.strictTransportSecurity.maxAge < 0) {
      errors.push('HSTS max-age must be non-negative');
    }

    if (this.config.frameOptions.action === 'ALLOW-FROM' && !this.config.frameOptions.origin) {
      errors.push('ALLOW-FROM frame option requires origin');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Create security headers middleware
 */
export function createSecurityHeadersMiddleware(config?: Partial<SecurityHeadersConfig>): SecurityHeadersMiddleware {
  return new SecurityHeadersMiddleware(config);
}