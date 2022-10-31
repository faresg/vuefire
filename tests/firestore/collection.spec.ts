import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import {
  collection as originalCollection,
  CollectionReference,
  doc,
  DocumentData,
  Query,
  where,
} from 'firebase/firestore'
import { expectType, setupFirestoreRefs, tds, firestore } from '../utils'
import { computed, nextTick, ref, unref, type Ref } from 'vue'
import { _InferReferenceType, _RefFirestore } from '../../src/firestore'
import {
  useCollection,
  UseCollectionOptions,
  VueFirestoreQueryData,
} from '../../src'
import { _MaybeRef } from '../../src/shared'

describe(
  'Firestore collections',
  () => {
    const { collection, query, addDoc, setDoc, updateDoc, deleteDoc } =
      setupFirestoreRefs()

    function factory<T = DocumentData>({
      options,
      ref = collection(),
    }: {
      options?: UseCollectionOptions
      ref?: _MaybeRef<CollectionReference<T>>
    } = {}) {
      let data!: _RefFirestore<VueFirestoreQueryData<T>>

      const wrapper = mount({
        template: 'no',
        setup() {
          // @ts-expect-error: generic forced
          data =
            // split for ts
            useCollection(ref, options)
          const { data: list, pending, error, promise, unbind } = data
          return { list, pending, error, promise, unbind }
        },
      })

      return {
        wrapper,
        listRef: unref(ref),
        // non enumerable properties cannot be spread
        data: data.data,
        pending: data.pending,
        error: data.error,
        promise: data.promise,
        unbind: data.unbind,
      }
    }

    function factoryQuery<T = DocumentData>({
      options,
      ref,
    }: {
      options?: UseCollectionOptions
      ref?: _MaybeRef<CollectionReference<T> | Query<T>>
    } = {}) {
      let data!: _RefFirestore<VueFirestoreQueryData<T>>

      const wrapper = mount({
        template: 'no',
        setup() {
          // @ts-expect-error: generic forced
          data = useCollection(
            // @ts-expect-error: generic forced
            ref,
            options
          )
          const { data: list, pending, error, promise, unbind } = data
          return { list, pending, error, promise, unbind }
        },
      })

      return {
        wrapper,
        // non enumerable properties cannot be spread
        data: data.data,
        pending: data.pending,
        error: data.error,
        promise: data.promise,
        unbind: data.unbind,
      }
    }

    function sortedList<
      A extends Array<Record<any, unknown>>,
      K extends keyof A[any]
    >(list: A, key: K) {
      return list.slice().sort((a, b) => {
        const aVal = a[key]
        const bVal = b[key]
        return typeof aVal === 'string' && typeof bVal === 'string'
          ? aVal.localeCompare(bVal)
          : 0
      })
    }

    it('add items to the collection', async () => {
      const { wrapper, listRef } = factory<{ name: string }>()

      await addDoc(listRef, { name: 'a' })
      await addDoc(listRef, { name: 'b' })
      await addDoc(listRef, { name: 'c' })
      expect(wrapper.vm.list).toHaveLength(3)
      expect(wrapper.vm.list).toContainEqual({ name: 'a' })
      expect(wrapper.vm.list).toContainEqual({ name: 'b' })
      expect(wrapper.vm.list).toContainEqual({ name: 'c' })
    })

    it('delete items from the collection', async () => {
      const { wrapper, listRef } = factory<{ name: string }>()

      const aRef = doc(listRef)
      await setDoc(aRef, { name: 'a' })
      const bRef = doc(listRef)
      await setDoc(bRef, { name: 'b' })
      const cRef = doc(listRef)
      await setDoc(cRef, { name: 'c' })

      await deleteDoc(aRef)
      expect(wrapper.vm.list).toHaveLength(2)
      expect(wrapper.vm.list).toContainEqual({ name: 'b' })
      expect(wrapper.vm.list).toContainEqual({ name: 'c' })

      await deleteDoc(cRef)
      expect(wrapper.vm.list).toHaveLength(1)
      expect(wrapper.vm.list).toContainEqual({ name: 'b' })
    })

    it('updates items of the collection', async () => {
      const { wrapper, listRef } = factory<{ name: string }>()

      const aRef = doc(listRef)
      await setDoc(aRef, { name: 'a' })
      const bRef = doc(listRef)
      await setDoc(bRef, { name: 'b' })
      const cRef = doc(listRef)
      await setDoc(cRef, { name: 'c' })

      await setDoc(aRef, { name: 'aa' })
      await updateDoc(cRef, { name: 'cc' })
      expect(wrapper.vm.list).toHaveLength(3)
      expect(wrapper.vm.list).toContainEqual({ name: 'aa' })
      expect(wrapper.vm.list).toContainEqual({ name: 'b' })
      expect(wrapper.vm.list).toContainEqual({ name: 'cc' })
    })

    it('can add an array with null to the collection', async () => {
      const { wrapper, listRef, data } = factory<{
        list: Array<number | null>
      }>()

      await addDoc(listRef, { list: [2, null] })
      expect(wrapper.vm.list).toHaveLength(1)
      expect(wrapper.vm.list).toContainEqual({ list: [2, null] })
    })

    it('adds a non enumerable id to docs in the collection', async () => {
      const { wrapper, listRef, data } = factory<{ name: string }>()

      const a = await addDoc(listRef, { name: 'a' })
      expect(wrapper.vm.list).toHaveLength(1)
      expect(data.value[0].id).toBeTypeOf('string')
      expect(data.value[0].id).toEqual(a.id)
    })

    it('unbinds when the component is unbound', async () => {
      const { wrapper, listRef, data } = factory()

      await addDoc(listRef, { name: 'a' })
      expect(data.value).toHaveLength(1)
      await wrapper.unmount()
      // use a copy instead of length to avoid depending on reset option
      const copy = [...data.value]
      await addDoc(listRef, { name: 'b' })
      expect(data.value).toEqual(copy)
    })

    it('can be manually unbound', async () => {
      const { listRef, data, unbind } = factory()

      await addDoc(listRef, { name: 'a' })
      expect(data.value).toHaveLength(1)
      unbind()
      // use a copy instead of length to avoid depending on reset option
      const copy = [...data.value]
      await addDoc(listRef, { name: 'b' })
      expect(data.value).toEqual(copy)
    })

    it('rejects on error', async () => {
      const { error, promise } = factory({
        ref: originalCollection(firestore, 'cannot exist'),
      })

      expect(error.value).toBeUndefined()
      await expect(unref(promise)).rejects.toThrow()
      expect(error.value).toBeTruthy()
    })

    it('resolves when the ref is populated', async () => {
      const ref = collection()
      await addDoc(ref, { name: 'a' })
      await addDoc(ref, { name: 'b' })
      const { error, promise, data } = factory({ ref })

      await expect(unref(promise)).resolves.toEqual(expect.anything())
      expect(data.value).toContainEqual({ name: 'a' })
      expect(data.value).toContainEqual({ name: 'b' })
      expect(error.value).toBeUndefined()
    })

    describe('reset option', () => {
      it('resets the value when specified', async () => {
        const { wrapper, listRef, data } = factory({ options: { reset: true } })

        await addDoc(listRef, { name: 'a' })
        expect(data.value).toHaveLength(1)
        await wrapper.unmount()
        expect(data.value).toHaveLength(0)
      })

      it('skips resetting by default', async () => {
        const { wrapper, listRef, data } = factory()
        await addDoc(listRef, { name: 'a' })
        expect(data.value).toHaveLength(1)
        await wrapper.unmount()
        expect(data.value).toHaveLength(1)
      })

      it('can be reset to a specific value', async () => {
        const { wrapper, listRef, data } = factory({
          options: { reset: () => 'reset' },
        })

        await addDoc(listRef, { name: 'a' })
        expect(data.value).toHaveLength(1)
        await wrapper.unmount()
        expect(data.value).toEqual('reset')
      })
    })

    it('awaits before setting the value if wait', async () => {
      const { wrapper, listRef, data } = factory({
        options: {
          wait: true,
          target: ref([{ name: 'old' }]),
        },
      })

      const p = addDoc(listRef, { name: 'a' })
      expect(data.value).toEqual([{ name: 'old' }])
      await p
      expect(data.value).toEqual([{ name: 'a' }])
    })

    it('can be bound to a ref of a query', async () => {
      const listRef = collection<{ text: string; finished: boolean }>()
      const finishedListRef = query(listRef, where('finished', '==', true))
      const unfinishedListRef = query(listRef, where('finished', '==', false))
      const showFinished = ref(false)
      const listToDisplay = computed(() =>
        showFinished.value ? finishedListRef : unfinishedListRef
      )
      await addDoc(listRef, { text: 'task 1', finished: false })
      await addDoc(listRef, { text: 'task 2', finished: false })
      await addDoc(listRef, { text: 'task 3', finished: true })
      await addDoc(listRef, { text: 'task 4', finished: false })

      const { wrapper, data, promise } = factoryQuery({
        ref: listToDisplay,
      })

      await promise.value
      expect(data.value).toHaveLength(3)
      expect(data.value).toContainEqual({ text: 'task 1', finished: false })
      expect(data.value).toContainEqual({ text: 'task 2', finished: false })
      expect(data.value).toContainEqual({ text: 'task 4', finished: false })

      showFinished.value = true
      await nextTick()
      await promise.value
      await nextTick()
      expect(data.value).toHaveLength(1)
      expect(data.value).toContainEqual({ text: 'task 3', finished: true })
    })

    tds(() => {
      interface TodoI {
        text: string
        finished: boolean
      }

      const db = firestore
      const collection = originalCollection
      expectType<Ref<DocumentData[]>>(useCollection(collection(db, 'todos')))
      // @ts-expect-error: document data by default
      expectType<Ref<number[]>>(useCollection(collection(db, 'todos')))

      // Adds the id
      // FIXME: this one is any but the test passes
      expectType<string>(useCollection(collection(db, 'todos')).value[0].id)
      expectType<string>(
        useCollection<TodoI>(collection(db, 'todos')).value[0].id
      )
      expectType<string>(
        useCollection<unknown>(collection(db, 'todos')).value[0].id
      )
      useCollection(
        collection(db, 'todos').withConverter<TodoI>({
          fromFirestore: (snapshot) => {
            const data = snapshot.data()
            return { text: data.text, finished: data.finished }
          },
          toFirestore: (todo) => todo,
        })
        // @ts-expect-error: no id with custom converter
      ).value[0].id

      expectType<Ref<TodoI[]>>(useCollection<TodoI>(collection(db, 'todos')))
      expectType<Ref<TodoI[]>>(
        useCollection<TodoI>(collection(db, 'todos')).data
      )
      expectType<string>(
        useCollection<TodoI>(collection(db, 'todos')).value.at(0)!.id
      )
      expectType<string>(
        useCollection<TodoI>(collection(db, 'todos')).data.value.at(0)!.id
      )
      // @ts-expect-error: wrong type
      expectType<Ref<string[]>>(useCollection<TodoI>(collection(db, 'todos')))

      const refWithConverter = collection(db, 'todos').withConverter<number>({
        toFirestore: (data) => ({ n: data }),
        fromFirestore: (snap, options) => snap.data(options).n as number,
      })
      expectType<Ref<number[]>>(useCollection(refWithConverter))
      expectType<Ref<number[]>>(useCollection(refWithConverter).data)
      // @ts-expect-error: no id with converter
      expectType<Ref<number[]>>(useCollection(refWithConverter).data.value.id)
      // @ts-expect-error
      expectType<Ref<string[]>>(useCollection(refWithConverter))
    })
  },
  { retry: 3 }
)
