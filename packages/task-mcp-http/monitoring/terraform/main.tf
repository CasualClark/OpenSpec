terraform {
  required_version = ">= 1.0"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.6"
    }
    kubectl = {
      source  = "alekc/kubectl"
      version = "~> 2.0"
    }
  }
}

provider "kubernetes" {
  config_path = var.kubeconfig_path
}

provider "helm" {
  kubernetes {
    config_path = var.kubeconfig_path
  }
}

provider "kubectl" {
  config_path = var.kubeconfig_path
}

# Variables
variable "kubeconfig_path" {
  description = "Path to kubeconfig file"
  type        = string
  default     = "~/.kube/config"
}

variable "namespace" {
  description = "Kubernetes namespace for monitoring"
  type        = string
  default     = "task-mcp-monitoring"
}

variable "grafana_admin_password" {
  description = "Grafana admin password"
  type        = string
  sensitive   = true
}

variable "prometheus_storage_size" {
  description = "Storage size for Prometheus"
  type        = string
  default     = "50Gi"
}

variable "grafana_storage_size" {
  description = "Storage size for Grafana"
  type        = string
  default     = "10Gi"
}

# Create namespace
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = var.namespace
    labels = {
      name = var.namespace
    }
  }
}

# Prometheus StorageClass
resource "kubectl_manifest" "prometheus_storageclass" {
  yaml_body = <<-EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: prometheus-storage
  labels:
    app: prometheus
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
allowVolumeExpansion: true
reclaimPolicy: Retain
EOF

  depends_on = [kubernetes_namespace.monitoring]
}

# Grafana StorageClass
resource "kubectl_manifest" "grafana_storageclass" {
  yaml_body = <<-EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: grafana-storage
  labels:
    app: grafana
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
allowVolumeExpansion: true
reclaimPolicy: Retain
EOF

  depends_on = [kubernetes_namespace.monitoring]
}

# Prometheus Operator Helm Chart
resource "helm_release" "prometheus_operator" {
  name       = "prometheus-operator"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  namespace  = var.namespace
  version    = "45.1.0"

  set {
    name  = "prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName"
    value = "prometheus-storage"
  }

  set {
    name  = "prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage"
    value = var.prometheus_storage_size
  }

  set {
    name  = "grafana.persistence.storageClassName"
    value = "grafana-storage"
  }

  set {
    name  = "grafana.persistence.size"
    value = var.grafana_storage_size
  }

  set {
    name  = "grafana.adminPassword"
    value = var.grafana_admin_password
  }

  values = [
    yamlencode({
      prometheusOperator = {
        enabled = true
      }
      prometheus = {
        prometheusSpec = {
          retention = "30d"
          resources = {
            requests = {
              cpu    = "1000m"
              memory = "2Gi"
            }
            limits = {
              cpu    = "2000m"
              memory = "4Gi"
            }
          }
        }
      }
      grafana = {
        enabled = true
        sidecar = {
          datasources = {
            enabled = true
          }
          dashboards = {
            enabled = true
            searchNamespace = var.namespace
          }
        }
        plugins = [
          "grafana-piechart-panel",
          "grafana-worldmap-panel",
          "grafana-clock-panel"
        ]
      }
      alertmanager = {
        enabled = true
        alertmanagerSpec = {
          storage = {
            volumeClaimTemplate = {
              spec = {
                storageClassName = "prometheus-storage"
                resources = {
                  requests = {
                    storage = "10Gi"
                  }
                }
              }
            }
          }
        }
      }
      nodeExporter = {
        enabled = true
      }
      kubeStateMetrics = {
        enabled = true
      }
    })
  ]

  depends_on = [
    kubernetes_namespace.monitoring,
    kubectl_manifest.prometheus_storageclass,
    kubectl_manifest.grafana_storageclass
  ]
}

# ConfigMap for Prometheus rules
resource "kubernetes_config_map" "prometheus_rules" {
  metadata {
    name      = "prometheus-rules"
    namespace = var.namespace
    labels = {
      app = "prometheus"
    }
  }

  data = {
    "slo-alerts.yml" = file("${path.module}/../../prometheus/rules/slo-alerts.yml")
  }

  depends_on = [helm_release.prometheus_operator]
}

# ConfigMap for AlertManager configuration
resource "kubernetes_config_map" "alertmanager_config" {
  metadata {
    name      = "alertmanager-config"
    namespace = var.namespace
    labels = {
      app = "alertmanager"
    }
  }

  data = {
    "alertmanager.yml" = file("${path.module}/../../alertmanager/alertmanager.yml")
  }

  depends_on = [helm_release.prometheus_operator]
}

# ConfigMap for AlertManager templates
resource "kubernetes_config_map" "alertmanager_templates" {
  metadata {
    name      = "alertmanager-templates"
    namespace = var.namespace
    labels = {
      app = "alertmanager"
    }
  }

  data = {
    "slack.tmpl" = file("${path.module}/../../alertmanager/templates/slack.tmpl")
    "email.tmpl" = file("${path.module}/../../alertmanager/templates/email.tmpl")
  }

  depends_on = [helm_release.prometheus_operator]
}

# ConfigMaps for Grafana dashboards
resource "kubernetes_config_map" "grafana_dashboards" {
  metadata {
    name      = "grafana-dashboards"
    namespace = var.namespace
    labels = {
      grafana_dashboard = "1"
    }
  }

  data = {
    "overview.json"    = file("${path.module}/../../grafana/dashboards/overview.json")
    "api.json"         = file("${path.module}/../../grafana/dashboards/api.json")
    "tools.json"       = file("${path.module}/../../grafana/dashboards/tools.json")
    "streaming.json"   = file("${path.module}/../../grafana/dashboards/streaming.json")
    "infrastructure.json" = file("${path.module}/../../grafana/dashboards/infrastructure.json")
    "security.json"    = file("${path.module}/../../grafana/dashboards/security.json")
  }

  depends_on = [helm_release.prometheus_operator]
}

# ServiceMonitor for Task MCP HTTP
resource "kubectl_manifest" "task_mcp_servicemonitor" {
  yaml_body = <<-EOF
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: task-mcp-http
  namespace: ${var.namespace}
  labels:
    app: task-mcp-http
    release: prometheus-operator
spec:
  selector:
    matchLabels:
      app: task-mcp-http
  endpoints:
  - port: metrics
    path: /metrics
    interval: 30s
    scrapeTimeout: 10s
EOF

  depends_on = [helm_release.prometheus_operator]
}

# PrometheusRule for Task MCP
resource "kubectl_manifest" "task_mcp_prometheus_rule" {
  yaml_body = <<-EOF
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: task-mcp-rules
  namespace: ${var.namespace}
  labels:
    app: prometheus
    release: prometheus-operator
spec:
  groups:
  - name: task-mcp-slo-alerts
    rules:
    - alert: TaskMCPHighErrorRateFastBurn
      expr: |
        (
          sum(rate(http_server_requests_total{status=~"5.."}[5m])) /
          sum(rate(http_server_requests_total[5m]))
        ) > 0.05
      for: 5m
      labels:
        severity: critical
        slo: availability
        burn_rate: fast
      annotations:
        summary: "Task MCP HTTP server experiencing high error rate (fast burn)"
        description: |
          Error rate is {{ $value | humanizePercentage }} over the last 5 minutes.
          This would consume the monthly error budget in less than 2 hours.
        dashboard_url: "https://grafana.company.com/d/task-mcp-overview"
EOF

  depends_on = [helm_release.prometheus_operator]
}

# Output values
output "grafana_url" {
  description = "URL to access Grafana"
  value       = "http://grafana.${var.namespace}.svc.cluster.local:3000"
}

output "prometheus_url" {
  description = "URL to access Prometheus"
  value       = "http://prometheus.${var.namespace}.svc.cluster.local:9090"
}

output "alertmanager_url" {
  description = "URL to access AlertManager"
  value       = "http://alertmanager.${var.namespace}.svc.cluster.local:9093"
}