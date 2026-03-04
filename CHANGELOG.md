# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
