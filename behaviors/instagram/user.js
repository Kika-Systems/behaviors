import * as lib from '../../lib';
import * as shared from './shared';
import * as selectors from './selectors';

function loggedIn(xpg) {
  return (
    xpg(selectors.notLoggedInXpaths.login).length === 0 &&
    xpg(selectors.notLoggedInXpaths.signUp).length === 0
  );
}

async function* viewStories() {
  // get the original full URI of the browser
  const originalLoc = window.location.href;
  // click the first story
  const firstStoryClicked = lib.selectElemAndClick(selectors.userOpenStories);
  if (!firstStoryClicked) return; // no storied if
  // history manipulation will change the browser URI so
  // we must wait for that to happen
  await lib.waitForHistoryManipToChangeLocation(originalLoc);
  let wasClicked;
  let videoButton;
  // stories are sorta on autoplay but we should speed things up
  let toBeClicked = lib.qs(selectors.userNextStory);
  // we will continue to speed up autoplay untill the next story
  // button does not exist or we are done (window.location.href === originalLoc)
  lib.collectOutlinksFromDoc();
  let totalStories = 0;
  while (!lib.locationEquals(originalLoc) && toBeClicked != null) {
    wasClicked = await lib.clickWithDelay(toBeClicked);
    // if the next story part button was not clicked
    // or autoplay is finished we are done
    if (!wasClicked || lib.locationEquals(originalLoc)) break;
    totalStories += 1;
    videoButton = lib.qs(selectors.userStoryVideo);
    if (videoButton) {
      // this part of a story is video content
      let maybeVideo = lib.qs('video');
      // click the button if not already playing
      if (maybeVideo && maybeVideo.paused) {
        await lib.clickWithDelay(videoButton);
      }
      // safety check due to autoplay
      if (lib.locationEquals(originalLoc)) break;
      // force play the video if not already playing
      if (maybeVideo && maybeVideo.paused) {
        await lib.noExceptPlayMediaElement(maybeVideo);
      }
      yield lib.stateWithMsgNoWait(`Viewed video of story #${totalStories}`);
      // safety check due to autoplay
      if (lib.locationEquals(originalLoc)) break;
    } else {
      yield lib.stateWithMsgNoWait(`Viewed story #${totalStories}`);
    }
    toBeClicked = lib.qs(selectors.userNextStory);
  }
}

async function* handlePost(post, xpg) {
  // open the post (displayed in a separate part of the dom)
  // click the first child of the post div (a tag)
  lib.autoFetchFromDoc();
  let maybeA = lib.firstChildElementOf(post);
  if (!lib.objectInstanceOf(maybeA, window.HTMLAnchorElement)) {
    maybeA = lib.qs('a', maybeA);
  }
  if (!maybeA) {
    // we got nothing halp!!!
    lib.collectOutlinksFrom(post);
    yield lib.stateWithMsgNoWait('Encountered a non-post');
    return;
  }
  await lib.clickWithDelay(maybeA);
  // wait for the post dialog to open and get a reference to that dom element
  const popupDialog = await lib.waitForAndSelectElement(
    document,
    selectors.userDivDialog
  );
  lib.collectOutlinksFrom(popupDialog);
  // get the next inner div.dialog because its next sibling is the close button
  // until instagram decides to change things
  const innerDivDialog = lib.qs(selectors.userDivDialog, popupDialog);
  // maybe our friendo the close button
  const maybeCloseButton = lib.getElemSibling(innerDivDialog);
  const closeButton = lib.elementsNameEquals(maybeCloseButton, 'button')
    ? maybeCloseButton
    : null;
  // get a reference to the posts contents (div.dialog > article)
  const content = lib.qs(selectors.userDivDialogArticle, innerDivDialog);
  // the next image button exists in the popup post even if the post is not
  // multi-image, so lets get a reference to it
  const displayDiv = lib.qs(selectors.userMultiImageDisplayDiv, content);
  const { msg, wait } = await shared.handlePostContent({
    thePost: post,
    multiImgElem: content,
    videoElem: displayDiv,
    isSinglePost: false,
  });
  yield lib.createState(wait, msg);
  const commentList = lib.qs('ul', content);
  if (commentList) {
    yield* shared.loadAllComments(commentList);
    yield* lib.traverseChildrenOf(commentList, shared.commentViewer());
  }
  // The load more comments button, depending on the number of comments,
  // will contain two variations of text (see xpathQ for those two variations).
  // getMoreComments handles getting that button for the two variationsif (closeButton != null) {
  if (closeButton != null) {
    await lib.clickWithDelay(closeButton);
  } else {
    await lib.clickWithDelay(
      lib.xpathOneOf({
        xpg,
        queries: selectors.postPopupCloseXpath,
      })
    );
  }
}

/**
 * @desc
 * @param {Element} row
 * @param {*} xpg
 * @return {AsyncIterableIterator<*>}
 */
async function* handleRow(row, xpg) {
  await lib.scrollIntoViewWithDelay(row);
  yield* lib.traverseChildrenOf(row, handlePost, xpg);
}

export default async function* instagramUserBehavior(cliAPI) {
  // view all stories when logged in
  if (loggedIn(cliAPI.$x)) {
    yield* viewStories();
  }
  const postRowContainer = lib.chainFistChildElemOf(
    lib.qs(selectors.userPostTopMostContainer),
    2
  );
  if (postRowContainer == null) {
    // we got nothing at this point, HALP!!!
    lib.collectOutlinksFromDoc();
    lib.autoFetchFromDoc();
    yield lib.stateWithMsgNoWait('There was no post');
    return;
  }
  // for each post row view the posts it contains
  yield* lib.traverseChildrenOfLoaderParent(
    postRowContainer,
    handleRow,
    cliAPI.$x
  );
}

export const metaData = {
  name: 'instagramUserBehavior',
  match: {
    regex: /^https:\/\/(www\.)?instagram\.com\/[^/]+(?:\/(?:tagged(?:\/)?)?)?$/,
  },
  description:
    'Capture all stories, images, videos and comments on user’s page.',
};

export const isBehavior = true;
