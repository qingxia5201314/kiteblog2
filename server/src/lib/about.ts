export interface AboutProfile {
  avatarUrl: string;
  displayName: string;
  identityTags: string[];
  intro: string;
  githubUrl: string;
  content: string;
  updatedAt: string;
}

export type ReadonlyAboutProfile = {
  readonly avatarUrl: string;
  readonly displayName: string;
  readonly identityTags: readonly string[];
  readonly intro: string;
  readonly githubUrl: string;
  readonly content: string;
  readonly updatedAt: string;
};

export const EMPTY_ABOUT_PROFILE: ReadonlyAboutProfile = Object.freeze({
  avatarUrl: '',
  displayName: '',
  identityTags: Object.freeze([]),
  intro: '',
  githubUrl: '',
  content: '',
  updatedAt: ''
});

export function emptyAboutProfile(): AboutProfile {
  return {
    avatarUrl: EMPTY_ABOUT_PROFILE.avatarUrl,
    displayName: EMPTY_ABOUT_PROFILE.displayName,
    identityTags: [],
    intro: EMPTY_ABOUT_PROFILE.intro,
    githubUrl: EMPTY_ABOUT_PROFILE.githubUrl,
    content: EMPTY_ABOUT_PROFILE.content,
    updatedAt: EMPTY_ABOUT_PROFILE.updatedAt
  };
}

export function isAboutProfileEmpty(profile: AboutProfile): boolean {
  return !profile.displayName.trim() && !profile.content.trim();
}
