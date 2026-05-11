/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as convexUserIdentity from "../convexUserIdentity.js";
import type * as documentTabs from "../documentTabs.js";
import type * as documents from "../documents.js";
import type * as files from "../files.js";
import type * as ownerInternal from "../ownerInternal.js";
import type * as platformSettings from "../platformSettings.js";
import type * as templateContent from "../templateContent.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  convexUserIdentity: typeof convexUserIdentity;
  documentTabs: typeof documentTabs;
  documents: typeof documents;
  files: typeof files;
  ownerInternal: typeof ownerInternal;
  platformSettings: typeof platformSettings;
  templateContent: typeof templateContent;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
