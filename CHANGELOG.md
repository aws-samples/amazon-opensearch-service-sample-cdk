# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Version Series Overview

| Series | Theme | Key Highlights |
|--------|-------|---------------|
| **0.3.x** | Single-stack simplification | 4 stacks → 1 `OpenSearchStack`, removed monitoring + VPC Lambda, discriminated JSON Schema, collection groups, SAML auth, cold storage, deploy script |
| **0.2.x** | Feature expansion + DX | Serverless support, discriminated union types, config validation, cdk-nag, example configs, README rewrite, tagging, snapshot tests |
| **0.1.x** | Initial stabilization | CI/CD, release workflows, CFN templates, VPC mismatch protection, Node matrix, supply chain hardening |

<details>
<summary>What changed between 0.2.x and 0.3.x</summary>

- **Architecture**: `NetworkStack` + `OpenSearchDomainStack` + `ServerlessCollectionStack` + `MonitoringStack` consolidated into a single `OpenSearchStack`
- **Removed**: `MonitoringStack` (CloudWatch alarms), VPC mismatch validation Lambda
- **Added**: JSON Schema `if/then/else` discriminated validation, serverless collection groups, SAML authentication, cold storage, Multi-AZ with Standby, off-peak window, scoped data access (`dataAccessPrincipals`), `deploy.sh` script, CDK diff in CI
- **Code**: `common-utilities.ts` slimmed down, `createBasicAuthSecret`/`generateClusterExports` moved to private methods

</details>

<details>
<summary>What changed between 0.1.x and 0.2.x</summary>

- **Architecture**: Added OpenSearch Serverless support, smart VPC creation (only when managed clusters exist)
- **API**: `StackPropsExt` → inline props, `VpcDetails` rewritten as immutable, factory functions removed
- **DX**: README rewrite, example configs, `npm run validate`, `.editorconfig`, cdk-nag, cfn-lint, custom tagging, snapshot tests, JSON Schema, discriminated union types
- **CI**: Node version matrix, CodeQL security fixes, Dependabot auto-merge, link-checker

</details>

## 0.3.2 - 2026-03-05

### Added
- **DomainEndpoint output**: Full HTTPS endpoint URL (`https://` prefixed) for each managed domain
- **DomainVpcEndpoint output**: VPC endpoint URL via `DomainEndpoints.vpc` CloudFormation attribute for VPC-enabled domains
- **DomainArn output**: Domain ARN for IAM policy references

## 0.3.1 - 2026-03-05

### Changed
- **Documentation**: Added v0.2.x vs v0.3.x migration guide with breaking changes table
- **Documentation**: Added collapsible `<details>`/`<summary>` sections throughout README for examples, config reference, and migration guides
- **CHANGELOG**: Added Version Series Overview table and collapsible comparison summaries

## 0.3.0 - 2026-07-03

### Breaking Changes
- **Single stack architecture**: `NetworkStack`, `OpenSearchDomainStack`, `ServerlessCollectionStack`, and `MonitoringStack` replaced by a single `OpenSearchStack`. Stack name pattern: `OpenSearch-<stage>-<region>`.
- **MonitoringStack removed**: CloudWatch alarms are no longer deployed. Remove `monitoringEnabled` and `snsTopicArn` from your config.
- **VPC validation Lambda removed**: The custom resource that checked for VPC mismatches is gone.
- **`ClusterType` moved**: Now exported from `cluster-config.ts` (re-exported from `common-utilities.ts` for backward compat).
- **`createBasicAuthSecret` / `generateClusterExports` removed from public API**: Now private methods on `OpenSearchStack`.

### Added
- **JSON Schema discriminated validation** (`if/then/else`): Managed clusters only accept managed fields, serverless only accepts serverless fields. Cross-type fields are rejected. `additionalProperties: false` enforced everywhere.
- **Serverless collection groups**: `collections` array on serverless configs — multiple collections sharing encryption, network, and data-access policies.
- **SAML authentication**: `samlEntityId`, `samlMetadataContent`, `samlMasterUserName`, `samlMasterBackendRole`, `samlRolesKey`, `samlSubjectKey`, `samlSessionTimeoutMinutes`.
- **Cold storage**: `coldStorageEnabled` (requires UltraWarm + dedicated managers).
- **Multi-AZ with Standby**: `multiAZWithStandbyEnabled`.
- **Off-peak maintenance window**: `offPeakWindowEnabled`.
- **Scoped data access**: `dataAccessPrincipals` on serverless configs — scope data access policies to specific IAM principals instead of account root.
- **Deploy script**: `deploy.sh` with `--stage`, `--context-file`, `--dry-run`, `--require-approval` flags.
- **CDK diff in CI**: `cfn-diff` job runs `cdk diff` on PRs.
- **Construct library docs**: README documents install from GitHub Release tarball and direct `OpenSearchStack` usage.

### Changed
- `common-utilities.ts` slimmed down — only engine version parsing and removal policy parsing remain.
- README updated for single-stack architecture, new features, and updated project structure.

## 0.2.10 - 2026-03-05

### Added
- Integration test workflow (`workflow_dispatch`) — deploys serverless example, verifies endpoint, tears down
- Uses OIDC for AWS credentials, always cleans up even on failure

## 0.2.9 - 2026-03-05

### Added
- CloudWatch monitoring stack with 7 alarms (cluster red/yellow, free storage, JVM pressure, CPU, search latency, snapshot failures)
- `monitoringEnabled` and `snsTopicArn` config options for opt-in monitoring
- Serverless VPC endpoint support via `vpcEndpointId` config field
- Serverless CFN template now included in release artifacts

### Changed
- Rewrote `cfn-synth.ts` — replaced 400 lines of L1 constructs with real CDK stack synthesis (-292 lines)
- CFN templates in releases now exactly match what `cdk deploy` produces
- New exports: `MonitoringStack`, `MonitoringStackProps`

## 0.2.8 - 2026-03-05

### Added
- JSON Schema (`cluster-config.schema.json`) for config validation and editor autocomplete
- Cross-field validation: warns when serverless clusters have managed-only fields and vice versa
- `$schema` references in all example configs for IDE support

### Changed
- **Breaking:** `ClusterConfig` is now a discriminated union (`ManagedClusterConfig | ServerlessClusterConfig`)
- `parseClusterConfig` returns the correct variant based on `clusterType`
- `OpenSearchDomainStack` accepts `ManagedClusterConfig`, `ServerlessCollectionStack` accepts `ServerlessClusterConfig`
- New exports: `ManagedClusterConfig`, `ServerlessClusterConfig`, `BaseClusterConfig`

## 0.2.7 - 2026-03-05

### Added
- Custom tagging strategy: auto-applies `Environment`, `ManagedBy`, `Project` tags to all stacks
- User-defined tags via `tags` config option (key-value map applied to all resources)
- Snapshot tests for NetworkStack, OpenSearchDomainStack, and ServerlessCollectionStack
- Dependabot auto-merge workflow for semver-patch updates
- 14 unit tests for `getContextForType` covering CLI string coercion, defaults, and error cases

### Changed
- Refactored `context-parsing.ts`: extracted `coerceCliString` helper, added JSDoc documentation
- Documented the double-parse behavior in `parseContextJson` with clear explanation

## 0.2.6 - 2026-03-04

### Changed
- README title updated to "Amazon OpenSearch Service Sample CDK" to match repo name
- Added aws-samples callout explaining this is a sample/reference implementation
- Reframed README language throughout to emphasize sample project nature

## 0.2.5 - 2026-03-04

### Changed
- Replaced ASCII architecture diagram in README with Mermaid flowchart (renders natively on GitHub)

## 0.2.4 - 2026-03-04

### Added
- `cdk-nag` integration with AWS Solutions Checks — validates all CDK constructs against AWS best practices
- `cfn-lint` CI job — synthesizes and lints CloudFormation templates on every PR
- VPC Flow Logs on NetworkStack (reject traffic → CloudWatch Logs)
- cdk-nag test suite covering managed, serverless, and mixed deployments

### Changed
- VPC validation Lambda upgraded to Node.js 22.x (current LTS)
- Fixed `examples/single-domain.json`: dedicated manager node count (3 → 2) for 2-AZ compatibility

## 0.2.3 - 2026-03-04

### Changed
- All npm scripts now use `npx` prefix to resolve binaries from `node_modules/.bin` instead of relying on global installations

## 0.2.2 - 2026-03-04

### Added
- Example config files in `examples/` directory: single-domain, serverless, multi-cluster, bring-your-own-vpc
- `npm run validate` script — dry-run config validation via `cdk synth --no-staging -q`
- `.editorconfig` — consistent formatting across editors (2-space indent, LF, UTF-8)

### Changed
- README rewritten with hero section, badges, architecture diagram, secure defaults table, full configuration reference, and examples directory links
- Jest `forceExit` enabled to suppress worker process exit warning

## 0.2.1 - 2026-03-04

### Changed
- **BREAKING:** Removed `StackPropsExt` interface — stacks now use inline `stage` prop on their own props interfaces
- **BREAKING:** Removed `OpensearchDomainStackProps` — replaced by `OpenSearchDomainStackProps` with `config: ClusterConfig` + optional `vpcDetails`/`vpcId`
- **BREAKING:** Removed `createOpenSearchStack` and `createServerlessStack` factory functions — stacks are constructed directly in `StackComposer`
- **BREAKING:** `VpcDetails` rewritten as immutable with static factory methods (`fromCreatedVpc`, `fromVpcLookup`) — constructor and `initialize()` removed
- Smart NetworkStack creation: VPC only created when at least one managed cluster exists (serverless-only deployments no longer create unnecessary VPCs)
- `OpenSearchDomainStack` and `ServerlessCollectionStack` now take `ClusterConfig` directly instead of verbose intermediate props
- Barrel export updated: removed `StackPropsExt`, `OpensearchDomainStackProps`, factory functions

### Added
- README: link to [v0.1.10 README](https://github.com/aws-samples/amazon-opensearch-service-sample-cdk/blob/v0.1.10/README.md) for legacy users
- README: multi-cluster deployment examples (managed + serverless in one config)
- README: serverless collection quick start
- README: full configuration reference for all cluster types
- Tests for smart VPC behavior (serverless-only skips NetworkStack, mixed creates it)

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
