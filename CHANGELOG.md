# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.1.0 - 2026-03-04

### Added
- Barrel export (`lib/index.ts`) for package public API
- GitHub Actions release workflow (tag-triggered)
- GitHub Actions version bump workflow (manual dispatch)
- Build verification in CI pipeline
- This changelog

### Infrastructure
- `NetworkStack` — VPC with configurable subnets and security groups
- `OpenSearchDomainStack` — Managed OpenSearch Service domain
- `StackComposer` — Orchestrates multi-stack deployments from CDK context
