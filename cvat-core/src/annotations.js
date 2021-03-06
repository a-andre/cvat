/*
* Copyright (C) 2018 Intel Corporation
* SPDX-License-Identifier: MIT
*/

/* global
    require:false
*/

(() => {
    const serverProxy = require('./server-proxy');
    const Collection = require('./annotations-collection');
    const AnnotationsSaver = require('./annotations-saver');
    const { checkObjectType } = require('./common');
    const { Task } = require('./session');
    const {
        ScriptingError,
        DataError,
    } = require('./exceptions');

    const jobCache = new WeakMap();
    const taskCache = new WeakMap();

    function getCache(sessionType) {
        if (sessionType === 'task') {
            return taskCache;
        }

        if (sessionType === 'job') {
            return jobCache;
        }

        throw new ScriptingError(
            `Unknown session type was received ${sessionType}`,
        );
    }

    async function getAnnotationsFromServer(session) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);

        if (!cache.has(session)) {
            const rawAnnotations = await serverProxy.annotations
                .getAnnotations(sessionType, session.id);

            // Get meta information about frames
            const startFrame = sessionType === 'job' ? session.startFrame : 0;
            const stopFrame = sessionType === 'job' ? session.stopFrame : session.size - 1;
            const frameMeta = {};
            for (let i = startFrame; i <= stopFrame; i++) {
                frameMeta[i] = await session.frames.get(i);
            }

            const collection = new Collection({
                labels: session.labels || session.task.labels,
                startFrame,
                stopFrame,
                frameMeta,
            }).import(rawAnnotations);

            const saver = new AnnotationsSaver(rawAnnotations.version, collection, session);

            cache.set(session, {
                collection,
                saver,

            });
        }
    }

    async function getAnnotations(session, frame, filter) {
        await getAnnotationsFromServer(session);
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);
        return cache.get(session).collection.get(frame, filter);
    }

    async function saveAnnotations(session, onUpdate) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);

        if (cache.has(session)) {
            await cache.get(session).saver.save(onUpdate);
        }

        // If a collection wasn't uploaded, than it wasn't changed, finally we shouldn't save it
    }

    function mergeAnnotations(session, objectStates) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);

        if (cache.has(session)) {
            return cache.get(session).collection.merge(objectStates);
        }

        throw new DataError(
            'Collection has not been initialized yet. Call annotations.get() or annotations.clear(true) before',
        );
    }

    function splitAnnotations(session, objectState, frame) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);

        if (cache.has(session)) {
            return cache.get(session).collection.split(objectState, frame);
        }

        throw new DataError(
            'Collection has not been initialized yet. Call annotations.get() or annotations.clear(true) before',
        );
    }

    function groupAnnotations(session, objectStates, reset) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);

        if (cache.has(session)) {
            return cache.get(session).collection.group(objectStates, reset);
        }

        throw new DataError(
            'Collection has not been initialized yet. Call annotations.get() or annotations.clear(true) before',
        );
    }

    function hasUnsavedChanges(session) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);

        if (cache.has(session)) {
            return cache.get(session).saver.hasUnsavedChanges();
        }

        return false;
    }

    async function clearAnnotations(session, reload) {
        checkObjectType('reload', reload, 'boolean', null);
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);

        if (cache.has(session)) {
            cache.get(session).collection.clear();
        }

        if (reload) {
            cache.delete(session);
            await getAnnotationsFromServer(session);
        }
    }

    function annotationsStatistics(session) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);

        if (cache.has(session)) {
            return cache.get(session).collection.statistics();
        }

        throw new DataError(
            'Collection has not been initialized yet. Call annotations.get() or annotations.clear(true) before',
        );
    }

    function putAnnotations(session, objectStates) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);

        if (cache.has(session)) {
            return cache.get(session).collection.put(objectStates);
        }

        throw new DataError(
            'Collection has not been initialized yet. Call annotations.get() or annotations.clear(true) before',
        );
    }

    function selectObject(session, objectStates, x, y) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        const cache = getCache(sessionType);

        if (cache.has(session)) {
            return cache.get(session).collection.select(objectStates, x, y);
        }

        throw new DataError(
            'Collection has not been initialized yet. Call annotations.get() or annotations.clear(true) before',
        );
    }

    async function uploadAnnotations(session, file, format) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        await serverProxy.annotations.uploadAnnotations(sessionType, session.id, file, format);
    }

    async function dumpAnnotations(session, name, format) {
        const sessionType = session instanceof Task ? 'task' : 'job';
        const result = await serverProxy.annotations
            .dumpAnnotations(sessionType, session.id, name, format);
        return result;
    }

    module.exports = {
        getAnnotations,
        putAnnotations,
        saveAnnotations,
        hasUnsavedChanges,
        mergeAnnotations,
        splitAnnotations,
        groupAnnotations,
        clearAnnotations,
        annotationsStatistics,
        selectObject,
        uploadAnnotations,
        dumpAnnotations,
    };
})();
