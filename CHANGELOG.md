# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.2.0 - 2026-03-04

### Added
- **OpenSearch Serverless support** — new `OPENSEARCH_SERVERLESS` cluster type for deploying serverless collections
  - `ServerlessCollectionStack` with encryption, network, and data access policies
  - Configurable collection types: `SEARCH`, `TIMESERIES`, `VECTORSEARCH`
  - Configurable standby replicas: `ENABLED` (default), `DISABLED`
  - Serverless clusters don't require VPC configuration
- 18 new VpcDetails unit tests (coverage: 39% → 98%)
- 10 new serverless collection tests (100% coverage)

### Changed
- **BREAKING:** `ClusterType` enum now includes `OPENSEARCH_SERVERLESS` — consumers using exhaustive switches must handle the new variant
- **BREAKING:** Full strict TypeScript enabled (`strictPropertyInitialization`) — may surface type errors in downstream code extending these classes
- `ClusterConfig` interface has new optional fields: `collectionType`, `standbyReplicas`
- Cleaned up `tsconfig.json` — removed redundant flags already implied by `strict: true`
- `VpcDetails` properties use definite assignment assertions (`!`) for properties set in `initialize()`

## 0.1.10 - 2026-03-04

### Security
- Pinned all GitHub Actions to commit SHAs instead of mutable tags (security best practice to prevent supply chain attacks):
  - `actions/checkout@v6` → `actions/checkout@de0fac2e`
  - `actions/setup-node@v6` → `actions/setup-node@53b83947`
  - `softprops/action-gh-release@v2` → `softprops/action-gh-release@a06a81a0`
  - `lycheeverse/lychee-action@v2` → `lycheeverse/lychee-action@8646ba30`

## 0.1.9 - 2026-03-04

### Changed
- Moved `source-map-support` from `dependencies` to `devDependencies` — it's only used in `bin/app.ts` for debugging stack traces, not needed by library consumers. The package now has zero runtime dependencies.

## 0.1.8 - 2026-03-04

### Fixed
- EBS `iops` and `throughput` are now only set when the volume type supports them: `iops` for GP3/IO1/IO2, `throughput` for GP3 only. Previously these values were passed for all volume types, which could cause CloudFormation errors.

### Added
- Test for non-GP3 volume types verifying iops/throughput are not set

## 0.1.7 - 2026-03-04

### Changed
- Rewrote README with comprehensive documentation: quick start, CFN template deployment, all configuration options, VPC mismatch protection, release workflow, and development guide

## 0.1.6 - 2026-03-04

### Removed
- Unused dependencies: `node-forge`, `yaml`, `esbuild`, `@types/node-forge`
- Redundant `release` npm script (superseded by `prepublishOnly`)

## 0.1.5 - 2026-03-04

### Added
- VPC mismatch validation: a custom resource now checks that an existing OpenSearch domain's VPC matches the VPC being deployed to, failing fast with a clear error message instead of the confusing "subnets must be in the same VPC" CloudFormation error
- This prevents silent failures when the NetworkStack is recreated with a new VPC while the OpenSearch domain still exists in the old VPC

## 0.1.4 - 2026-03-04

### Changed
- CI `node-tests` job now runs a matrix across all non-deprecated Node.js versions: 20.x, 22.x, 24.x (LTS), and 25.x (latest)
- Updated `engines.node` to `>=20` (Node 18 is EOL)

## 0.1.3 - 2026-03-04

### Added
- Standalone CloudFormation templates as release artifacts (`cfn-NetworkStack.min.json`, `cfn-OpenSearchDomainStack.min.json`)
- Templates use CloudFormation Parameters — deployable directly via AWS Console or CLI without CDK
- `bin/cfn-synth.ts` — separate CDK app for synthesizing parameterized CFN templates

### Fixed
- Bumped CI/release/version-bump workflows from Node 18 to Node 20 (required by ESLint 10)

### Parameters (NetworkStack)
- `Stage`, `VpcCidr`, `PublicSubnet1Cidr`, `PublicSubnet2Cidr`, `PrivateSubnet1Cidr`, `PrivateSubnet2Cidr`

### Parameters (OpenSearchDomainStack)
- `Stage`, `SubnetIds`, `SecurityGroupId`, `DomainName`, `EngineVersion`
- `DataNodeInstanceType`, `DataNodeCount`, `DedicatedManagerNodeType`, `DedicatedManagerNodeCount`
- `EBSVolumeSize`, `EBSVolumeType`, `EBSIops`, `EBSThroughput`

## 0.1.2 - 2026-03-04

### Changed
- CI restricted to `main` branch pushes and PRs only (no duplicate runs on tag pushes)
- Simplified `node-tests` CI job (removed unnecessary matrix strategy)
- Added `prepublishOnly` script to auto-build before `npm pack`

### Fixed
- Added `types` condition to `exports` for proper TypeScript module resolution

## 0.1.1 - 2026-03-04

### Fixed
- Package entry points now correctly point to `dist/lib/index.js` (was `dist/index.js`)
- Removed redundant `.npmignore` (superseded by `files` field in package.json)

### Added
- Keywords in package.json for discoverability

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
