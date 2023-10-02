import Str from 'expensify-common/lib/str';
import CONST from '../CONST';
import ONYXKEYS from '../ONYXKEYS';
import * as OnyxTypes from '../types/onyx';

type PolicyMemberList = Record<string, OnyxTypes.PolicyMember>;
type PolicyMembersCollection = Record<string, PolicyMemberList>;
type MemberEmailsToAccountIDs = Record<string, string>;
type PersonalDetailsList = Record<string, OnyxTypes.PersonalDetails>;
type UnitRate = {rate: number};

/**
 * Filter out the active policies, which will exclude policies with pending deletion
 * These are policies that we can use to create reports with in NewDot.
 */
function getActivePolicies(policies: OnyxTypes.Policy[]): OnyxTypes.Policy[] {
    return (policies ?? []).filter(
        (policy) => policy && (policy.isPolicyExpenseChatEnabled || policy.areChatRoomsEnabled) && policy.pendingAction !== CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE,
    );
}

/**
 * Checks if we have any errors stored within the POLICY_MEMBERS. Determines whether we should show a red brick road error or not.
 * Data structure: {accountID: {role:'user', errors: []}, accountID2: {role:'admin', errors: [{1231312313: 'Unable to do X'}]}, ...}
 */
function hasPolicyMemberError(policyMembers: PolicyMemberList): boolean {
    return Object.values(policyMembers ?? {}).some((member) => Object.keys(member?.errors ?? {}).length > 0);
}

/**
 * Check if the policy has any error fields.
 */
function hasPolicyErrorFields(policy: OnyxTypes.Policy): boolean {
    return Object.keys(policy?.errorFields ?? {}).some((fieldErrors) => Object.keys(fieldErrors ?? {}).length > 0);
}

/**
 * Check if the policy has any errors, and if it doesn't, then check if it has any error fields.
 */
function hasPolicyError(policy: OnyxTypes.Policy): boolean {
    return Object.keys(policy?.errors ?? {}).length > 0 ? true : hasPolicyErrorFields(policy);
}

/**
 * Checks if we have any errors stored within the policy custom units.
 */
function hasCustomUnitsError(policy: OnyxTypes.Policy): boolean {
    return Object.keys(policy?.customUnits?.errors ?? {}).length > 0;
}

function getNumericValue(value: number, toLocaleDigit: (arg: string) => string): number | string {
    const numValue = parseFloat(value.toString().replace(toLocaleDigit('.'), '.'));
    if (Number.isNaN(numValue)) {
        return NaN;
    }
    return numValue.toFixed(CONST.CUSTOM_UNITS.RATE_DECIMALS);
}

function getRateDisplayValue(value: number, toLocaleDigit: (arg: string) => string): string {
    const numValue = getNumericValue(value, toLocaleDigit);
    if (Number.isNaN(numValue)) {
        return '';
    }
    return numValue.toString().replace('.', toLocaleDigit('.')).substring(0, value.toString().length);
}

function getUnitRateValue(customUnitRate: UnitRate, toLocaleDigit: (arg: string) => string) {
    return getRateDisplayValue((customUnitRate?.rate ?? 0) / CONST.POLICY.CUSTOM_UNIT_RATE_BASE_OFFSET, toLocaleDigit);
}

/**
 * Get the brick road indicator status for a policy. The policy has an error status if there is a policy member error, a custom unit error or a field error.
 */
function getPolicyBrickRoadIndicatorStatus(policy: OnyxTypes.Policy, policyMembersCollection: PolicyMembersCollection): string {
    const policyMembers = policyMembersCollection?.[`${ONYXKEYS.COLLECTION.POLICY_MEMBERS}${policy.id}`] ?? {};
    if (hasPolicyMemberError(policyMembers) || hasCustomUnitsError(policy) || hasPolicyErrorFields(policy)) {
        return CONST.BRICK_ROAD_INDICATOR_STATUS.ERROR;
    }
    return '';
}

/**
 * Check if the policy can be displayed
 * If offline, always show the policy pending deletion.
 * If online, show the policy pending deletion only if there is an error.
 * Note: Using a local ONYXKEYS.NETWORK subscription will cause a delay in
 * updating the screen. Passing the offline status from the component.
 */
function shouldShowPolicy(policy: OnyxTypes.Policy, isOffline: boolean): boolean {
    return (
        policy &&
        policy?.isPolicyExpenseChatEnabled &&
        policy?.role === CONST.POLICY.ROLE.ADMIN &&
        (isOffline || policy?.pendingAction !== CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE || Object.keys(policy.errors ?? {}).length > 0)
    );
}

function isExpensifyTeam(email: string): boolean {
    const emailDomain = Str.extractEmailDomain(email ?? '');
    return emailDomain === CONST.EXPENSIFY_PARTNER_NAME || emailDomain === CONST.EMAIL.GUIDES_DOMAIN;
}

function isExpensifyGuideTeam(email: string): boolean {
    const emailDomain = Str.extractEmailDomain(email ?? '');
    return emailDomain === CONST.EMAIL.GUIDES_DOMAIN;
}

/**
 * Checks if the current user is an admin of the policy.
 */
const isPolicyAdmin = (policy: OnyxTypes.Policy): boolean => policy?.role === CONST.POLICY.ROLE.ADMIN;

/**
 * Create an object mapping member emails to their accountIDs. Filter for members without errors, and get the login email from the personalDetail object using the accountID.
 *
 * We only return members without errors. Otherwise, the members with errors would immediately be removed before the user has a chance to read the error.
 */
function getMemberAccountIDsForWorkspace(policyMembers: PolicyMemberList, personalDetails: PersonalDetailsList): MemberEmailsToAccountIDs {
    const memberEmailsToAccountIDs: Record<string, string> = {};
    Object.keys(policyMembers ?? {}).forEach((accountID) => {
        const member = policyMembers?.[accountID];
        if (Object.keys(member?.errors ?? {})?.length > 0) {
            return;
        }
        const personalDetail = personalDetails[accountID];
        if (!personalDetail?.login) {
            return;
        }
        memberEmailsToAccountIDs[personalDetail.login] = accountID;
    });
    return memberEmailsToAccountIDs;
}

/**
 * Get login list that we should not show in the workspace invite options
 */
function getIneligibleInvitees(policyMembers: PolicyMemberList, personalDetails: PersonalDetailsList): string[] {
    const memberEmailsToExclude: string[] = [...CONST.EXPENSIFY_EMAILS];
    Object.keys(policyMembers ?? {}).forEach((accountID) => {
        const policyMember = policyMembers?.[accountID];
        // Policy members that are pending delete or have errors are not valid and we should show them in the invite options (don't exclude them).
        if (policyMember.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE || Object.keys(policyMember?.errors ?? {}).length > 0) {
            return;
        }
        const memberEmail = personalDetails?.[accountID]?.login;
        if (!memberEmail) {
            return;
        }
        memberEmailsToExclude.push(memberEmail);
    });

    return memberEmailsToExclude;
}

/**
 * Gets the tag from policy tags, defaults to the first if no key is provided.
 */
function getTag(policyTags: Record<string, OnyxTypes.PolicyTag>, tagKey?: keyof typeof policyTags) {
    if (Object.keys(policyTags ?? {})?.length === 0) {
        return {};
    }

    const policyTagKey = tagKey ?? Object.keys(policyTags ?? {})[0];

    return policyTags?.[policyTagKey] ?? {};
}

/**
 * Gets the first tag name from policy tags.
 */
function getTagListName(policyTags: Record<string, OnyxTypes.PolicyTag>) {
    if (Object.keys(policyTags ?? {})?.length === 0) {
        return '';
    }

    const policyTagKeys = Object.keys(policyTags ?? {})[0] ?? [];

    return policyTags?.[policyTagKeys]?.name ?? '';
}

/**
 * Gets the tags of a policy for a specific key. Defaults to the first tag if no key is provided.
 */
function getTagList(policyTags: Record<string, Record<string, OnyxTypes.PolicyTag>>, tagKey: string) {
    if (Object.keys(policyTags ?? {})?.length === 0) {
        return {};
    }

    const policyTagKey = tagKey ?? Object.keys(policyTags ?? {})[0];

    return policyTags?.[policyTagKey]?.tags ?? {};
}

function isPendingDeletePolicy(policy: OnyxTypes.Policy): boolean {
    return policy?.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE;
}

export {
    getActivePolicies,
    hasPolicyMemberError,
    hasPolicyError,
    hasPolicyErrorFields,
    hasCustomUnitsError,
    getNumericValue,
    getUnitRateValue,
    getPolicyBrickRoadIndicatorStatus,
    shouldShowPolicy,
    isExpensifyTeam,
    isExpensifyGuideTeam,
    isPolicyAdmin,
    getMemberAccountIDsForWorkspace,
    getIneligibleInvitees,
    getTag,
    getTagListName,
    getTagList,
    isPendingDeletePolicy,
};
